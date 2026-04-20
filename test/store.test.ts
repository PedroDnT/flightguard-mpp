import { describe, it, expect, beforeEach } from 'vitest'
import { PolicyStore } from '../src/store.js'

// Use a fresh store with a non-existent path so no disk I/O occurs
function makeStore() {
  return new PolicyStore('/dev/null/nonexistent-test-store.json')
}

const baseReq = {
  req: {
    flightNumber: 'LA3251',
    date: '2026-04-01',
    payoutAddress: '0x' + 'a'.repeat(40),
  },
  premiumAmount: '1.00',
  payoutAmount: '5.00',
  scheduledDeparture: '2026-04-01T10:00:00Z',
}

describe('PolicyStore.create', () => {
  it('creates an active policy with correct fields', () => {
    const store = makeStore()
    const policy = store.create(baseReq)
    expect(policy.status).toBe('active')
    expect(policy.flightNumber).toBe('LA3251')
    expect(policy.date).toBe('2026-04-01')
    expect(policy.premium).toBe('1.00')
    expect(policy.payoutAmount).toBe('5.00')
    expect(policy.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('uppercases the flight number', () => {
    const store = makeStore()
    const policy = store.create({
      ...baseReq,
      req: { ...baseReq.req, flightNumber: 'la3251' },
    })
    expect(policy.flightNumber).toBe('LA3251')
  })

  it('policy is retrievable via get()', () => {
    const store = makeStore()
    const policy = store.create(baseReq)
    expect(store.get(policy.id)).toEqual(policy)
  })
})

describe('PolicyStore.markPaidOut', () => {
  it('sets status to paid_out and stores txHash', () => {
    const store = makeStore()
    const policy = store.create(baseReq)
    const updated = store.markPaidOut(policy.id, '0xdeadbeef')
    expect(updated?.status).toBe('paid_out')
    expect(updated?.payoutTxHash).toBe('0xdeadbeef')
  })
})

describe('PolicyStore.markExpired', () => {
  it('sets status to expired', () => {
    const store = makeStore()
    const policy = store.create(baseReq)
    const updated = store.markExpired(policy.id)
    expect(updated?.status).toBe('expired')
  })
})

describe('PolicyStore.getActive', () => {
  it('returns only active policies', () => {
    const store = makeStore()
    const p1 = store.create(baseReq)
    const p2 = store.create({ ...baseReq, req: { ...baseReq.req, flightNumber: 'LA0002' } })
    store.markExpired(p2.id)
    const active = store.getActive()
    expect(active).toHaveLength(1)
    expect(active[0].id).toBe(p1.id)
  })
})

describe('PolicyStore.countByStatus', () => {
  it('counts correctly across statuses', () => {
    const store = makeStore()
    store.create(baseReq)
    const p2 = store.create({ ...baseReq, req: { ...baseReq.req, flightNumber: 'LA0002' } })
    store.markExpired(p2.id)
    const counts = store.countByStatus()
    expect(counts.active).toBe(1)
    expect(counts.expired).toBe(1)
    expect(counts.paid_out).toBe(0)
    expect(counts.cancelled).toBe(0)
  })
})

describe('PolicyStore.cleanup', () => {
  it('removes expired policies older than TTL', () => {
    const store = makeStore()
    const policy = store.create(baseReq)
    store.markExpired(policy.id)

    // Backdate the policy so it appears old
    const p = store.get(policy.id)!
    ;(p as any).updatedAt = Date.now() - 8 * 24 * 60 * 60 * 1000

    const removed = store.cleanup(7 * 24 * 60 * 60 * 1000)
    expect(removed).toBe(1)
    expect(store.get(policy.id)).toBeUndefined()
  })

  it('does not remove recently expired policies', () => {
    const store = makeStore()
    const policy = store.create(baseReq)
    store.markExpired(policy.id)

    const removed = store.cleanup(7 * 24 * 60 * 60 * 1000)
    expect(removed).toBe(0)
    expect(store.get(policy.id)).toBeDefined()
  })

  it('does not remove active policies', () => {
    const store = makeStore()
    const policy = store.create(baseReq)

    // Backdate it
    const p = store.get(policy.id)!
    ;(p as any).updatedAt = Date.now() - 8 * 24 * 60 * 60 * 1000

    const removed = store.cleanup(7 * 24 * 60 * 60 * 1000)
    expect(removed).toBe(0)
    expect(store.get(policy.id)).toBeDefined()
  })
})
