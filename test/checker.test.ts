import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FlightChecker } from '../src/checker.js'
import { store } from '../src/store.js'
import type { AppConfig, FlightInfo } from '../src/types.js'

// Partially mock flight.js: keep real helpers, only stub fetchFlightInfo
vi.mock('../src/flight.js', async () => {
  const actual = await vi.importActual<typeof import('../src/flight.js')>('../src/flight.js')
  return { ...actual, fetchFlightInfo: vi.fn() }
})

// Fully mock payout.js: no blockchain calls
const mockSendPayout = vi.hoisted(() => vi.fn())
vi.mock('../src/payout.js', () => {
  return {
    PayoutEngine: class {
      sendPayout = mockSendPayout
      getPoolBalance = vi.fn().mockResolvedValue('100.00')
    },
    buildPayoutMemo: vi.fn().mockReturnValue('flightguard:test:AA123:2026-03-24'),
  }
})

const config: AppConfig = {
  tempoRpcUrl: 'https://rpc.moderato.tempo.xyz',
  chainId: 42431,
  pathUsdAddress: '0x1111111111111111111111111111111111111111',
  poolPrivateKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
  poolAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  port: 3000,
  premiumAmount: '1.00',
  payoutMultiplier: 5,
  delayThresholdMin: 60,
  checkIntervalMs: 999_999_999,
  rapidApiKey: 'test',
}

const PAYOUT_ADDR = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

function makePolicy() {
  return store.create({
    req: { flightNumber: 'AA123', date: '2026-03-24', payoutAddress: PAYOUT_ADDR },
    premiumAmount: '1.00',
    payoutAmount: '5.00',
    scheduledDeparture: '2026-03-24T15:00:00Z',
  })
}

function makeFlightInfo(overrides: Partial<FlightInfo> = {}): FlightInfo {
  return {
    number: 'AA123',
    status: 'Departed',
    departure: {
      iata: 'JFK',
      name: 'John F. Kennedy',
      scheduledTime: { local: '2026-03-24T10:00:00', utc: '2026-03-24T15:00:00Z' },
      actualTime: { local: '2026-03-24T11:05:00', utc: '2026-03-24T16:05:00Z' },
      delays: [{ minutes: 65, reason: 'Weather' }],
    },
    arrival: { iata: 'LAX', name: 'Los Angeles International' },
    ...overrides,
  }
}

let fetchFlightInfo: ReturnType<typeof vi.fn>

beforeEach(async () => {
  // Clear the shared store between tests
  ;(store as any).policies.clear()

  const m = await import('../src/flight.js')
  fetchFlightInfo = vi.mocked(m.fetchFlightInfo)
  fetchFlightInfo.mockReset()
  mockSendPayout.mockReset()
})

describe('FlightChecker.runCycle', () => {
  it('skips fetch when there are no active policies', async () => {
    const checker = new FlightChecker(config)
    await (checker as any).runCycle()
    expect(fetchFlightInfo).not.toHaveBeenCalled()
  })

  // ── Case 1: Cancelled ────────────────────────────────────────

  it('case 1: marks policy expired when flight is cancelled', async () => {
    const policy = makePolicy()
    fetchFlightInfo.mockResolvedValue(makeFlightInfo({
      status: 'Cancelled',
      departure: { iata: 'JFK', name: 'JFK', delays: [] },
    }))

    await (new FlightChecker(config) as any).runCycle()

    expect(store.get(policy.id)!.status).toBe('expired')
    expect(mockSendPayout).not.toHaveBeenCalled()
  })

  // ── Case 2: Delay threshold ──────────────────────────────────

  it('case 2: triggers payout when delay equals threshold (60 min)', async () => {
    const policy = makePolicy()
    fetchFlightInfo.mockResolvedValue(makeFlightInfo({
      status: 'Departed',
      departure: {
        iata: 'JFK',
        name: 'JFK',
        delays: [{ minutes: 60 }],
      },
    }))
    mockSendPayout.mockResolvedValue({ success: true, txHash: '0xabc' })

    await (new FlightChecker(config) as any).runCycle()

    expect(store.get(policy.id)!.status).toBe('paid_out')
    expect(store.get(policy.id)!.payoutTxHash).toBe('0xabc')
    expect(mockSendPayout).toHaveBeenCalledOnce()
  })

  it('case 2: triggers payout when delay exceeds threshold (65 min)', async () => {
    const policy = makePolicy()
    fetchFlightInfo.mockResolvedValue(makeFlightInfo()) // default: Departed, 65 min delay
    mockSendPayout.mockResolvedValue({ success: true, txHash: '0xdef' })

    await (new FlightChecker(config) as any).runCycle()

    expect(store.get(policy.id)!.status).toBe('paid_out')
    expect(mockSendPayout).toHaveBeenCalledOnce()
  })

  it('case 2: does NOT trigger payout when delay is below threshold (59 min)', async () => {
    const policy = makePolicy()
    fetchFlightInfo.mockResolvedValue(makeFlightInfo({
      status: 'Departed',
      departure: { iata: 'JFK', name: 'JFK', delays: [{ minutes: 59 }] },
    }))

    await (new FlightChecker(config) as any).runCycle()

    // Departed with sub-threshold delay is not terminal → case 4: no action
    expect(store.get(policy.id)!.status).toBe('active')
    expect(mockSendPayout).not.toHaveBeenCalled()
  })

  // ── Case 3: Terminal, no qualifying delay ────────────────────

  it('case 3: marks expired when flight landed with small delay', async () => {
    const policy = makePolicy()
    fetchFlightInfo.mockResolvedValue(makeFlightInfo({
      status: 'Landed',
      departure: { iata: 'JFK', name: 'JFK', delays: [{ minutes: 10 }] },
    }))

    await (new FlightChecker(config) as any).runCycle()

    expect(store.get(policy.id)!.status).toBe('expired')
    expect(mockSendPayout).not.toHaveBeenCalled()
  })

  it('case 3: marks expired when flight arrived with no delay', async () => {
    const policy = makePolicy()
    fetchFlightInfo.mockResolvedValue(makeFlightInfo({
      status: 'Arrived',
      departure: { iata: 'JFK', name: 'JFK', delays: [] },
    }))

    await (new FlightChecker(config) as any).runCycle()

    expect(store.get(policy.id)!.status).toBe('expired')
  })

  // ── Case 4: In progress ──────────────────────────────────────

  it('case 4: no action when flight is still scheduled', async () => {
    const policy = makePolicy()
    fetchFlightInfo.mockResolvedValue(makeFlightInfo({
      status: 'Scheduled',
      departure: { iata: 'JFK', name: 'JFK', delays: [] },
    }))

    await (new FlightChecker(config) as any).runCycle()

    expect(store.get(policy.id)!.status).toBe('active')
    expect(mockSendPayout).not.toHaveBeenCalled()
  })

  it('case 4: no action when flight is enroute with sub-threshold delay', async () => {
    const policy = makePolicy()
    fetchFlightInfo.mockResolvedValue(makeFlightInfo({
      status: 'EnRoute',
      departure: { iata: 'JFK', name: 'JFK', delays: [{ minutes: 30 }] },
    }))

    await (new FlightChecker(config) as any).runCycle()

    expect(store.get(policy.id)!.status).toBe('active')
  })

  // ── Payout failure rollback ──────────────────────────────────

  it('rolls back status to active when payout fails', async () => {
    const policy = makePolicy()
    fetchFlightInfo.mockResolvedValue(makeFlightInfo()) // 65 min, departed
    mockSendPayout.mockResolvedValue({ success: false, error: 'network error' })

    await (new FlightChecker(config) as any).runCycle()

    // Must be rolled back to active so next cycle can retry
    expect(store.get(policy.id)!.status).toBe('active')
    expect(mockSendPayout).toHaveBeenCalledOnce()
  })

  // ── No flight data ───────────────────────────────────────────

  it('takes no action when fetchFlightInfo returns null', async () => {
    const policy = makePolicy()
    fetchFlightInfo.mockResolvedValue(null)

    await (new FlightChecker(config) as any).runCycle()

    expect(store.get(policy.id)!.status).toBe('active')
    expect(mockSendPayout).not.toHaveBeenCalled()
  })
})
