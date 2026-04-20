import { randomUUID } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import type { Policy, PolicyRequest, PolicyStatus } from "./types.js";
import { createLogger } from "../../shared/logger.js";

const log = createLogger("STORE");
const DEFAULT_STORE_PATH = resolve(
  process.cwd(),
  process.env.STORE_PATH ?? "policies.json",
);

function loadFromDisk(storePath: string): Map<string, Policy> {
  try {
    if (!existsSync(storePath)) return new Map();
    const raw = readFileSync(storePath, "utf-8");
    const entries = JSON.parse(raw) as [string, Policy][];
    log.log(`Loaded ${entries.length} policy(ies) from ${storePath}`);
    return new Map(entries);
  } catch (err) {
    log.error(`Failed to load from disk: ${err}. Starting fresh.`);
    return new Map();
  }
}

function saveToDisk(storePath: string, policies: Map<string, Policy>): void {
  try {
    writeFileSync(
      storePath,
      JSON.stringify(Array.from(policies.entries()), null, 2),
    );
  } catch (err) {
    log.error(`Failed to save to disk: ${err}`);
  }
}

export class PolicyStore {
  private policies: Map<string, Policy>;
  private storePath: string;

  constructor(storePath?: string) {
    this.storePath = storePath ? resolve(storePath) : DEFAULT_STORE_PATH;
    this.policies = loadFromDisk(this.storePath);
  }

  create(params: {
    req: PolicyRequest;
    premiumAmount: string;
    payoutAmount: string;
    scheduledDeparture: string;
  }): Policy {
    const id = randomUUID();
    const now = Date.now();

    const policy: Policy = {
      id,
      flightNumber: params.req.flightNumber.toUpperCase(),
      date: params.req.date,
      payoutAddress: params.req.payoutAddress,
      premium: params.premiumAmount,
      payoutAmount: params.payoutAmount,
      status: "active",
      scheduledDeparture: params.scheduledDeparture,
      createdAt: now,
      updatedAt: now,
    };

    this.policies.set(id, policy);
    saveToDisk(this.storePath, this.policies);

    log.log(`Policy created: ${id}`);
    log.log(`  Flight: ${policy.flightNumber} on ${policy.date}`);
    log.log(`  Payout to: ${policy.payoutAddress}`);
    log.log(`  Amount: ${policy.payoutAmount} pathUSD`);

    return policy;
  }

  get(id: string): Policy | undefined {
    return this.policies.get(id);
  }

  getActive(): Policy[] {
    return Array.from(this.policies.values()).filter(
      (p) => p.status === "active",
    );
  }

  getAll(): Policy[] {
    return Array.from(this.policies.values());
  }

  update(
    id: string,
    updates: Partial<
      Pick<
        Policy,
        "status" | "payoutTxHash" | "lastCheckedAt" | "lastFlightStatus"
      >
    >,
  ): Policy | undefined {
    const policy = this.policies.get(id);
    if (!policy) {
      log.warn(`Update failed — policy not found: ${id}`);
      return undefined;
    }

    const updated: Policy = {
      ...policy,
      ...updates,
      updatedAt: Date.now(),
    };

    this.policies.set(id, updated);
    saveToDisk(this.storePath, this.policies);
    log.log(`Policy ${id} updated → status: ${updated.status}`);

    return updated;
  }

  markPaidOut(id: string, txHash: string): Policy | undefined {
    return this.update(id, { status: "paid_out", payoutTxHash: txHash });
  }

  markExpired(id: string): Policy | undefined {
    return this.update(id, { status: "expired" });
  }

  recordCheck(id: string, flightStatus: string): Policy | undefined {
    return this.update(id, {
      lastCheckedAt: Date.now(),
      lastFlightStatus: flightStatus,
    });
  }

  cleanup(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    const terminal: PolicyStatus[] = ["paid_out", "expired", "cancelled"];
    let removed = 0;
    for (const [id, policy] of this.policies) {
      if (terminal.includes(policy.status) && policy.updatedAt < cutoff) {
        this.policies.delete(id);
        removed++;
      }
    }
    if (removed > 0) {
      log.log(
        `Cleaned up ${removed} terminal policy(ies) older than ${maxAgeMs / 86400000}d`,
      );
      saveToDisk(this.storePath, this.policies);
    }
    return removed;
  }

  countByStatus(): Record<PolicyStatus, number> {
    const counts: Record<PolicyStatus, number> = {
      active: 0,
      paid_out: 0,
      expired: 0,
      cancelled: 0,
    };
    for (const policy of this.policies.values()) {
      counts[policy.status]++;
    }
    return counts;
  }
}

export const store = new PolicyStore();
