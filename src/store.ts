// ============================================================
// FlightGuard MPP — In-Memory Policy Store
// ============================================================

import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import type { Policy, PolicyStatus, InsureRequest } from './types'

const DEFAULT_STORE_PATH = process.env.STORE_PATH ?? 'policies.json'

function loadFromDisk(storePath: string): Map<string, Policy> {
  try {
    if (!existsSync(storePath)) return new Map()
    const raw = readFileSync(storePath, 'utf-8')
    const entries = JSON.parse(raw) as [string, Policy][]
    console.log(`[STORE] Loaded ${entries.length} policy(ies) from ${storePath}`)
    return new Map(entries)
  } catch (err) {
    console.error(`[STORE] Failed to load from disk: ${err}. Starting fresh.`)
    return new Map()
  }
}

function saveToDisk(storePath: string, policies: Map<string, Policy>): void {
  try {
    writeFileSync(storePath, JSON.stringify(Array.from(policies.entries()), null, 2))
  } catch (err) {
    console.error(`[STORE] Failed to save to disk: ${err}`)
  }
}

export class PolicyStore {
  private policies: Map<string, Policy>
  private storePath: string

  constructor(storePath?: string) {
    this.storePath = storePath ?? DEFAULT_STORE_PATH
    this.policies = loadFromDisk(this.storePath)
  }

  /**
   * Create a new active policy after premium payment is confirmed.
   */
  create(params: {
    req: InsureRequest
    premiumAmount: string
    payoutAmount: string
    scheduledDeparture: string
  }): Policy {
    const id = randomUUID()
    const now = Date.now()

    const policy: Policy = {
      id,
      flightNumber: params.req.flightNumber.toUpperCase(),
      date: params.req.date,
      payoutAddress: params.req.payoutAddress,
      premium: params.premiumAmount,
      payoutAmount: params.payoutAmount,
      status: 'active',
      scheduledDeparture: params.scheduledDeparture,
      createdAt: now,
      updatedAt: now,
    }

    this.policies.set(id, policy)
    saveToDisk(this.storePath, this.policies)

    console.log(`[STORE] Policy created: ${id}`)
    console.log(`[STORE]   Flight: ${policy.flightNumber} on ${policy.date}`)
    console.log(`[STORE]   Payout to: ${policy.payoutAddress}`)
    console.log(`[STORE]   Amount: ${policy.payoutAmount} pathUSD`)

    return policy
  }

  /**
   * Get a single policy by ID. Returns undefined if not found.
   */
  get(id: string): Policy | undefined {
    return this.policies.get(id)
  }

  /**
   * Get all active policies (pending flight check).
   */
  getActive(): Policy[] {
    return Array.from(this.policies.values()).filter(
      (p) => p.status === 'active',
    )
  }

  /**
   * Get all policies (for admin/debugging).
   */
  getAll(): Policy[] {
    return Array.from(this.policies.values())
  }

  /**
   * Update policy status and optional fields.
   */
  update(
    id: string,
    updates: Partial<Pick<Policy, 'status' | 'payoutTxHash' | 'lastCheckedAt' | 'lastFlightStatus'>>,
  ): Policy | undefined {
    const policy = this.policies.get(id)
    if (!policy) {
      console.warn(`[STORE] Update failed — policy not found: ${id}`)
      return undefined
    }

    const updated: Policy = {
      ...policy,
      ...updates,
      updatedAt: Date.now(),
    }

    this.policies.set(id, updated)
    saveToDisk(this.storePath, this.policies)
    console.log(`[STORE] Policy ${id} updated → status: ${updated.status}`)

    return updated
  }

  /**
   * Mark policy as paid out.
   */
  markPaidOut(id: string, txHash: string): Policy | undefined {
    return this.update(id, { status: 'paid_out', payoutTxHash: txHash })
  }

  /**
   * Mark policy as expired (no payout).
   */
  markExpired(id: string): Policy | undefined {
    return this.update(id, { status: 'expired' })
  }

  /**
   * Record a checker poll result without changing status.
   */
  recordCheck(id: string, flightStatus: string): Policy | undefined {
    return this.update(id, {
      lastCheckedAt: Date.now(),
      lastFlightStatus: flightStatus,
    })
  }

  /**
   * Remove terminal policies older than maxAgeMs.
   * Call periodically to prevent unbounded store growth.
   */
  cleanup(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs
    const terminal: PolicyStatus[] = ['paid_out', 'expired', 'cancelled']
    let removed = 0
    for (const [id, policy] of this.policies) {
      if (terminal.includes(policy.status) && policy.updatedAt < cutoff) {
        this.policies.delete(id)
        removed++
      }
    }
    if (removed > 0) {
      console.log(`[STORE] Cleaned up ${removed} terminal policy(ies) older than ${maxAgeMs / 86400000}d`)
      saveToDisk(this.storePath, this.policies)
    }
    return removed
  }

  /**
   * Count policies by status (for health endpoint).
   */
  countByStatus(): Record<PolicyStatus, number> {
    const counts: Record<PolicyStatus, number> = {
      active: 0,
      paid_out: 0,
      expired: 0,
      cancelled: 0,
    }
    for (const policy of this.policies.values()) {
      counts[policy.status]++
    }
    return counts
  }
}

// Singleton export
export const store = new PolicyStore()
