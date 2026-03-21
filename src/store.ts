// ============================================================
// FlightGuard MPP — In-Memory Policy Store
// ============================================================

import { randomUUID } from 'crypto'
import type { Policy, PolicyStatus, InsureRequest } from './types.js'

class PolicyStore {
  private policies: Map<string, Policy> = new Map()

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
