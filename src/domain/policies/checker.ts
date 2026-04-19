import type { AppConfig } from "../../config/types.js";
import type { AlchemyClient } from "../../integrations/alchemy.js";
import { fetchFlightInfo } from "../../integrations/aerodatabox.js";
import { buildPayoutMemo, PayoutEngine } from "../../integrations/payout.js";
import { createLogger } from "../../shared/logger.js";
import { evaluatePolicy } from "./evaluatePolicy.js";
import { store } from "./store.js";
import type { CheckResult } from "./types.js";

const log = createLogger("CHECKER");

export class FlightChecker {
  private config: AppConfig;
  private payoutEngine: PayoutEngine;
  private alchemy: AlchemyClient | null;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor(config: AppConfig, alchemy: AlchemyClient | null = null) {
    this.config = config;
    this.payoutEngine = new PayoutEngine(config);
    this.alchemy = alchemy;
  }

  start(): void {
    if (this.isRunning) {
      log.warn("Already running");
      return;
    }

    log.log(
      `Starting — interval: ${this.config.checkIntervalMs}ms, delay threshold: ${this.config.delayThresholdMin}min`,
    );

    void this.runCycle();
    this.intervalHandle = setInterval(() => {
      void this.runCycle();
    }, this.config.checkIntervalMs);
    this.isRunning = true;
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.isRunning = false;
    log.log("Stopped");
  }

  private async runCycle(): Promise<void> {
    store.cleanup(7 * 24 * 60 * 60 * 1000);

    const active = store.getActive();

    if (active.length === 0) {
      log.log("No active policies to check");
      return;
    }

    log.log("─────────────────────────────────────");
    log.log(`Checking ${active.length} active policy(ies)`);
    log.log(`Time: ${new Date().toISOString()}`);

    const results: CheckResult[] = [];
    const settled = await Promise.allSettled(
      active.map((policy) => this.checkPolicy(policy.id)),
    );

    for (const outcome of settled) {
      if (outcome.status === "fulfilled" && outcome.value) {
        results.push(outcome.value);
      } else if (outcome.status === "rejected") {
        log.error(`Error checking policy: ${outcome.reason}`);
      }
    }

    const payouts = results.filter((result) => result.actionTaken === "payout");
    const expired = results.filter(
      (result) => result.actionTaken === "expired",
    );
    const none = results.filter((result) => result.actionTaken === "none");

    log.log("Cycle complete");
    log.log(`  Payouts triggered: ${payouts.length}`);
    log.log(`  Policies expired: ${expired.length}`);
    log.log(`  No action: ${none.length}`);
    log.log("─────────────────────────────────────");
  }

  private async checkPolicy(policyId: string): Promise<CheckResult | null> {
    const policy = store.get(policyId);
    if (!policy || policy.status !== "active") return null;

    log.log(`Checking policy ${policyId}`);
    log.log(`  Flight: ${policy.flightNumber} on ${policy.date}`);

    const flightInfo = await fetchFlightInfo(
      policy.flightNumber,
      policy.date,
      this.config.rapidApiKey,
    );

    if (!flightInfo) {
      log.log("  No flight data available — skipping");
      store.recordCheck(policyId, "unknown");
      return {
        policyId,
        flightNumber: policy.flightNumber,
        flightStatus: "unknown",
        delayMinutes: 0,
        actionTaken: "none",
      };
    }

    const evaluation = evaluatePolicy(flightInfo, this.config);

    log.log(`  Status: ${evaluation.flightStatus}`);
    log.log(`  Delay: ${evaluation.delayMinutes} minutes`);

    store.recordCheck(policyId, evaluation.flightStatus);

    if (evaluation.actionTaken === "expired") {
      log.log(`  → ${evaluation.reason} — marking policy expired`);
      store.markExpired(policyId);
      return {
        policyId,
        flightNumber: policy.flightNumber,
        flightStatus: evaluation.flightStatus,
        delayMinutes: evaluation.delayMinutes,
        actionTaken: "expired",
      };
    }

    if (evaluation.actionTaken === "payout") {
      log.log(
        `  → Delay ${evaluation.delayMinutes}min ≥ threshold ${this.config.delayThresholdMin}min — TRIGGERING PAYOUT`,
      );

      store.update(policyId, { status: "paid_out" });

      if (this.alchemy) {
        const price = await this.alchemy.getPathUsdPrice();
        if (price !== null) {
          const usdValue = (Number(policy.payoutAmount) * price).toFixed(2);
          log.log(
            `  Payout real value: ~$${usdValue} USD (pathUSD @ $${price})`,
          );
        }
      }

      const memo = buildPayoutMemo(policyId, policy.flightNumber, policy.date);
      const payoutResult = await this.payoutEngine.sendPayout({
        toAddress: policy.payoutAddress,
        amountHuman: policy.payoutAmount,
        memo,
      });

      if (payoutResult.success && payoutResult.txHash) {
        store.markPaidOut(policyId, payoutResult.txHash);
        log.log(`  PAYOUT SENT: ${payoutResult.txHash}`);
        return {
          policyId,
          flightNumber: policy.flightNumber,
          flightStatus: evaluation.flightStatus,
          delayMinutes: evaluation.delayMinutes,
          actionTaken: "payout",
          payoutTxHash: payoutResult.txHash,
        };
      }

      store.update(policyId, { status: "active" });
      log.error(`  PAYOUT FAILED: ${payoutResult.error}`);
      return {
        policyId,
        flightNumber: policy.flightNumber,
        flightStatus: evaluation.flightStatus,
        delayMinutes: evaluation.delayMinutes,
        actionTaken: "none",
      };
    }

    log.log(`  → No action (${evaluation.reason})`);
    return {
      policyId,
      flightNumber: policy.flightNumber,
      flightStatus: evaluation.flightStatus,
      delayMinutes: evaluation.delayMinutes,
      actionTaken: "none",
    };
  }
}
