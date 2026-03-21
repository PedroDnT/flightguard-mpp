// ============================================================
// FlightGuard MPP — Flight Checker Cron
// Polls active policies, triggers payouts automatically
// ============================================================

import { store } from './store.js'
import {
  fetchFlightInfo,
  getDepartureDelayMinutes,
  hasFlightDeparted,
  isFlightTerminal,
} from './flight.js'
import { PayoutEngine, buildPayoutMemo } from './payout.js'
import type { AppConfig, CheckResult } from './types.js'

export class FlightChecker {
  private config: AppConfig
  private payoutEngine: PayoutEngine
  private intervalHandle: ReturnType<typeof setInterval> | null = null
  private isRunning = false

  constructor(config: AppConfig) {
    this.config = config
    this.payoutEngine = new PayoutEngine(config)
  }

  /**
   * Start the checker loop.
   */
  start(): void {
    if (this.isRunning) {
      console.warn('[CHECKER] Already running')
      return
    }

    console.log(
      `[CHECKER] Starting — interval: ${this.config.checkIntervalMs}ms, delay threshold: ${this.config.delayThresholdMin}min`,
    )

    // Run immediately on start, then on interval
    this.runCycle()
    this.intervalHandle = setInterval(
      () => this.runCycle(),
      this.config.checkIntervalMs,
    )
    this.isRunning = true
  }

  /**
   * Stop the checker loop.
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = null
    }
    this.isRunning = false
    console.log('[CHECKER] Stopped')
  }

  /**
   * Run one full check cycle over all active policies.
   */
  private async runCycle(): Promise<void> {
    const active = store.getActive()

    if (active.length === 0) {
      console.log('[CHECKER] No active policies to check')
      return
    }

    console.log(`[CHECKER] ─────────────────────────────────────`)
    console.log(`[CHECKER] Checking ${active.length} active policy(ies)`)
    console.log(`[CHECKER] Time: ${new Date().toISOString()}`)

    const results: CheckResult[] = []

    for (const policy of active) {
      try {
        const result = await this.checkPolicy(policy.id)
        if (result) results.push(result)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[CHECKER] Error checking policy ${policy.id}: ${msg}`)
      }
    }

    // Summary
    const payouts = results.filter((r) => r.actionTaken === 'payout')
    const expired = results.filter((r) => r.actionTaken === 'expired')

    console.log(`[CHECKER] Cycle complete`)
    console.log(`[CHECKER]   Payouts triggered: ${payouts.length}`)
    console.log(`[CHECKER]   Policies expired:  ${expired.length}`)
    console.log(`[CHECKER]   No action:         ${results.filter((r) => r.actionTaken === 'none').length}`)
    console.log(`[CHECKER] ─────────────────────────────────────`)
  }

  /**
   * Check a single policy and take action if needed.
   */
  private async checkPolicy(policyId: string): Promise<CheckResult | null> {
    const policy = store.get(policyId)
    if (!policy || policy.status !== 'active') return null

    console.log(`[CHECKER] Checking policy ${policyId}`)
    console.log(`[CHECKER]   Flight: ${policy.flightNumber} on ${policy.date}`)

    // Fetch latest flight info
    const flightInfo = await fetchFlightInfo(
      policy.flightNumber,
      policy.date,
      this.config.rapidApiKey,
    )

    if (!flightInfo) {
      console.log(`[CHECKER]   No flight data available — skipping`)
      store.recordCheck(policyId, 'unknown')
      return {
        policyId,
        flightNumber: policy.flightNumber,
        flightStatus: 'unknown',
        delayMinutes: 0,
        actionTaken: 'none',
      }
    }

    const flightStatus = flightInfo.status
    const delayMinutes = getDepartureDelayMinutes(flightInfo)
    const departed = hasFlightDeparted(flightInfo)
    const terminal = isFlightTerminal(flightInfo)

    console.log(`[CHECKER]   Status:  ${flightStatus}`)
    console.log(`[CHECKER]   Delay:   ${delayMinutes} minutes`)

    store.recordCheck(policyId, flightStatus)

    // ── CASE 1: Flight cancelled — mark expired (no payout for cancellations)
    if (flightInfo.status === 'Cancelled') {
      console.log(`[CHECKER]   → Flight cancelled — marking policy expired`)
      store.markExpired(policyId)
      return {
        policyId,
        flightNumber: policy.flightNumber,
        flightStatus,
        delayMinutes,
        actionTaken: 'expired',
      }
    }

    // ── CASE 2: Delay exceeds threshold — trigger payout
    if (departed && delayMinutes >= this.config.delayThresholdMin) {
      console.log(
        `[CHECKER]   → Delay ${delayMinutes}min ≥ threshold ${this.config.delayThresholdMin}min — TRIGGERING PAYOUT`,
      )

      const memo = buildPayoutMemo(policyId, policy.flightNumber, policy.date)
      const payoutResult = await this.payoutEngine.sendPayout({
        toAddress: policy.payoutAddress,
        amountHuman: policy.payoutAmount,
        memo,
      })

      if (payoutResult.success && payoutResult.txHash) {
        store.markPaidOut(policyId, payoutResult.txHash)
        console.log(`[CHECKER]   ✅ PAYOUT SENT: ${payoutResult.txHash}`)
        return {
          policyId,
          flightNumber: policy.flightNumber,
          flightStatus,
          delayMinutes,
          actionTaken: 'payout',
          payoutTxHash: payoutResult.txHash,
        }
      } else {
        console.error(`[CHECKER]   ❌ PAYOUT FAILED: ${payoutResult.error}`)
        // Keep active so we retry next cycle
        return {
          policyId,
          flightNumber: policy.flightNumber,
          flightStatus,
          delayMinutes,
          actionTaken: 'none',
        }
      }
    }

    // ── CASE 3: Flight landed/arrived with no qualifying delay — expire
    if (terminal && delayMinutes < this.config.delayThresholdMin) {
      console.log(
        `[CHECKER]   → Flight ${flightStatus} with ${delayMinutes}min delay (< threshold) — marking expired`,
      )
      store.markExpired(policyId)
      return {
        policyId,
        flightNumber: policy.flightNumber,
        flightStatus,
        delayMinutes,
        actionTaken: 'expired',
      }
    }

    // ── CASE 4: Still in progress — no action
    console.log(`[CHECKER]   → No action (flight still in progress)`)
    return {
      policyId,
      flightNumber: policy.flightNumber,
      flightStatus,
      delayMinutes,
      actionTaken: 'none',
    }
  }
}
