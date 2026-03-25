import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildServer } from '../src/server.js'
import { store } from '../src/store.js'
import type { AppConfig } from '../src/types.js'

// Bypass MPP payment gate
vi.mock('mppx/server', () => ({
  Mppx: {
    create: vi.fn().mockReturnValue({
      charge: vi.fn().mockReturnValue(
        vi.fn().mockResolvedValue({
          status: 200,
          challenge: new Response('Payment required', { status: 402 }),
          withReceipt: (res: Response) => res,
        }),
      ),
    }),
  },
  tempo: vi.fn().mockReturnValue({}),
}))

// Stub fetchFlightInfo; keep real helpers
const mockFetchFlightInfo = vi.hoisted(() => vi.fn())
vi.mock('../src/flight.js', async () => {
  const actual = await vi.importActual<typeof import('../src/flight.js')>('../src/flight.js')
  return { ...actual, fetchFlightInfo: mockFetchFlightInfo }
})

// Stub PayoutEngine
const mockGetPoolBalance = vi.hoisted(() => vi.fn())
vi.mock('../src/payout.js', () => {
  return {
    PayoutEngine: class {
      sendPayout = vi.fn()
      getPoolBalance = mockGetPoolBalance
    },
    buildPayoutMemo: vi.fn(),
    buildTempoChain: vi.fn(),
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
  checkIntervalMs: 300_000,
  rapidApiKey: 'test',
}

// Minimal valid flight fixture
const VALID_FLIGHT = {
  number: 'AA123',
  status: 'Scheduled',
  departure: {
    iata: 'JFK',
    name: 'JFK',
    scheduledTime: { local: '2026-12-31T10:00:00', utc: '2026-12-31T15:00:00Z' },
    delays: [],
  },
  arrival: { iata: 'LAX', name: 'LAX' },
}

let ipCounter = 0
function uniqueIp() {
  return `10.0.0.${++ipCounter}`
}

async function req(
  app: ReturnType<typeof buildServer>,
  method: string,
  path: string,
  body?: unknown,
  ip?: string,
) {
  const headers: Record<string, string> = {
    'x-forwarded-for': ip ?? uniqueIp(),
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  )
}

beforeEach(() => {
  ;(store as any).policies.clear()
  mockFetchFlightInfo.mockReset()
  mockGetPoolBalance.mockResolvedValue('50.00')
})

// ─── GET /health ─────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with pool address, balance, and policy counts', async () => {
    const app = buildServer(config)
    const res = await req(app, 'GET', '/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.pool.address).toBe(config.poolAddress)
    expect(body.pool.balance).toContain('pathUSD')
    expect(body.policies).toMatchObject({ active: 0, paid_out: 0, expired: 0, cancelled: 0 })
    expect(body.config.premium).toContain('pathUSD')
    expect(body.config.delayThresholdMin).toBe(60)
  })
})

// ─── GET /policy/:id ─────────────────────────────────────────

describe('GET /policy/:id', () => {
  it('returns 404 for an unknown policy id', async () => {
    const app = buildServer(config)
    const res = await req(app, 'GET', '/policy/does-not-exist')
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/not found/i)
  })

  it('returns 200 with the policy when it exists', async () => {
    const policy = store.create({
      req: { flightNumber: 'LA3251', date: '2026-04-01', payoutAddress: '0x' + 'b'.repeat(40) },
      premiumAmount: '1.00',
      payoutAmount: '5.00',
      scheduledDeparture: '2026-04-01T10:00:00Z',
    })
    const app = buildServer(config)
    const res = await req(app, 'GET', `/policy/${policy.id}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.policy.id).toBe(policy.id)
    expect(body.policy.flightNumber).toBe('LA3251')
    expect(body.policy.status).toBe('active')
  })
})

// ─── POST /insure ─────────────────────────────────────────────

describe('POST /insure — input validation', () => {
  it('returns 400 when flightNumber is missing', async () => {
    const app = buildServer(config)
    const res = await req(app, 'POST', '/insure', {
      date: '2026-12-31',
      payoutAddress: '0x' + 'b'.repeat(40),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when date is missing', async () => {
    const app = buildServer(config)
    const res = await req(app, 'POST', '/insure', {
      flightNumber: 'AA123',
      payoutAddress: '0x' + 'b'.repeat(40),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when payoutAddress is missing', async () => {
    const app = buildServer(config)
    const res = await req(app, 'POST', '/insure', {
      flightNumber: 'AA123',
      date: '2026-12-31',
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid flight number format', async () => {
    const app = buildServer(config)
    const res = await req(app, 'POST', '/insure', {
      flightNumber: 'INVALID!!',
      date: '2026-12-31',
      payoutAddress: '0x' + 'b'.repeat(40),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/flight number/i)
  })

  it('returns 400 for wrong date format', async () => {
    const app = buildServer(config)
    const res = await req(app, 'POST', '/insure', {
      flightNumber: 'AA123',
      date: '31/12/2026',
      payoutAddress: '0x' + 'b'.repeat(40),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/YYYY-MM-DD/i)
  })

  it('returns 400 for a past date', async () => {
    const app = buildServer(config)
    const res = await req(app, 'POST', '/insure', {
      flightNumber: 'AA123',
      date: '2020-01-01',
      payoutAddress: '0x' + 'b'.repeat(40),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/past/i)
  })

  it('returns 400 for an invalid EVM address', async () => {
    const app = buildServer(config)
    const res = await req(app, 'POST', '/insure', {
      flightNumber: 'AA123',
      date: '2026-12-31',
      payoutAddress: 'not-an-address',
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/address/i)
  })

  it('returns 400 for invalid JSON body', async () => {
    const app = buildServer(config)
    const res = await app.fetch(
      new Request('http://localhost/insure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': uniqueIp(),
        },
        body: 'not json {{',
      }),
    )
    expect(res.status).toBe(400)
  })
})

describe('POST /insure — flight lookup', () => {
  it('returns 404 when flight does not exist', async () => {
    mockFetchFlightInfo.mockResolvedValue(null)
    const app = buildServer(config)
    const res = await req(app, 'POST', '/insure', {
      flightNumber: 'XX999',
      date: '2026-12-31',
      payoutAddress: '0x' + 'b'.repeat(40),
    })
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/not found/i)
  })

  it('returns 503 when flight API throws', async () => {
    mockFetchFlightInfo.mockRejectedValue(new Error('API unavailable'))
    const app = buildServer(config)
    const res = await req(app, 'POST', '/insure', {
      flightNumber: 'AA123',
      date: '2026-12-31',
      payoutAddress: '0x' + 'b'.repeat(40),
    })
    expect(res.status).toBe(503)
  })
})

describe('POST /insure — happy path', () => {
  it('creates a policy and returns 201', async () => {
    mockFetchFlightInfo.mockResolvedValue(VALID_FLIGHT)
    const app = buildServer(config)
    const res = await req(app, 'POST', '/insure', {
      flightNumber: 'aa123', // lowercase — should be normalised
      date: '2026-12-31',
      payoutAddress: '0x' + 'b'.repeat(40),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.policyId).toBeDefined()
    expect(body.flightNumber).toBe('AA123')
    expect(body.status).toBe('active')
    expect(body.payoutAmount).toBeDefined()
  })

  it('calculates payoutAmount as premium × multiplier', async () => {
    mockFetchFlightInfo.mockResolvedValue(VALID_FLIGHT)
    const app = buildServer(config)
    const res = await req(app, 'POST', '/insure', {
      flightNumber: 'AA123',
      date: '2026-12-31',
      payoutAddress: '0x' + 'b'.repeat(40),
    })
    const body = await res.json()
    // premium 1.00 × multiplier 5 = 5.00
    expect(body.payoutAmount).toBe('5.00')
  })
})
