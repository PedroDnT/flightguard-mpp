// ============================================================
// FlightGuard MPP — Hono HTTP Server
// Routes:
//   POST /insure        MPP-gated: buy insurance policy
//   GET  /policy/:id    Free: check policy status
//   GET  /health        Free: pool balance + stats
// ============================================================

import { Hono } from 'hono'
import { Mppx, tempo } from 'mppx/server'
import { store } from './store.js'
import { fetchFlightInfo, getScheduledDepartureUtc } from './flight.js'
import { PayoutEngine } from './payout.js'
import type { AppConfig, InsureRequest, InsureResponse, PolicyResponse } from './types.js'

export function buildServer(config: AppConfig): Hono {
  const app = new Hono()
  const payoutEngine = new PayoutEngine(config)

  // --- MPP setup ---
  const mppx = Mppx.create({
    methods: [
      tempo({
        currency: config.pathUsdAddress,
        recipient: config.poolAddress,
      }),
    ],
  })

  // ----------------------------------------------------------------
  // POST /insure  — Buy a flight delay insurance policy
  // Cost: config.premiumAmount pathUSD via MPP
  // ----------------------------------------------------------------
  app.post('/insure', async (c) => {
    console.log(`[SERVER] POST /insure`)

    // Gate with MPP payment
    const r = await mppx.charge({ amount: config.premiumAmount })(c.req.raw)
    if (r.status === 402) {
      console.log(`[SERVER] 402 — awaiting payment`)
      return r.challenge
    }

    // Parse body
    let body: InsureRequest
    try {
      body = await c.req.json<InsureRequest>()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }

    const { flightNumber, date, payoutAddress } = body

    // Validate inputs
    if (!flightNumber || !date || !payoutAddress) {
      return c.json(
        { error: 'Missing required fields: flightNumber, date, payoutAddress' },
        400,
      )
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json({ error: 'date must be YYYY-MM-DD' }, 400)
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(payoutAddress)) {
      return c.json({ error: 'payoutAddress must be a valid EVM address' }, 400)
    }

    console.log(`[SERVER] Insuring flight ${flightNumber} on ${date} → ${payoutAddress}`)

    // Verify flight exists
    let flightInfo
    try {
      flightInfo = await fetchFlightInfo(flightNumber, date, config.rapidApiKey)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[SERVER] Flight lookup failed: ${msg}`)
      return c.json({ error: `Flight data unavailable: ${msg}` }, 503)
    }

    if (!flightInfo) {
      return c.json(
        { error: `Flight ${flightNumber} not found for date ${date}` },
        404,
      )
    }

    const scheduledDeparture = getScheduledDepartureUtc(flightInfo)
    const payoutAmount = (
      parseFloat(config.premiumAmount) * config.payoutMultiplier
    ).toFixed(2)

    // Create policy
    const policy = store.create({
      req: { flightNumber, date, payoutAddress },
      premiumAmount: config.premiumAmount,
      payoutAmount,
      scheduledDeparture,
    })

    const response: InsureResponse = {
      policyId: policy.id,
      flightNumber: policy.flightNumber,
      date: policy.date,
      scheduledDeparture: policy.scheduledDeparture,
      premium: policy.premium,
      payoutAmount: policy.payoutAmount,
      payoutAddress: policy.payoutAddress,
      status: policy.status,
      message: `Policy active. Payout of ${payoutAmount} pathUSD fires automatically if departure delay exceeds ${config.delayThresholdMin} minutes.`,
    }

    console.log(`[SERVER] ✅ Policy issued: ${policy.id}`)
    return r.withReceipt(c.json(response, 201))
  })

  // ----------------------------------------------------------------
  // GET /policy/:id  — Check policy status
  // ----------------------------------------------------------------
  app.get('/policy/:id', async (c) => {
    const id = c.req.param('id')
    console.log(`[SERVER] GET /policy/${id}`)

    const policy = store.get(id)
    if (!policy) {
      return c.json({ error: `Policy not found: ${id}` }, 404)
    }

    const response: PolicyResponse = { policy }
    return c.json(response)
  })

  // ----------------------------------------------------------------
  // GET /health  — Pool stats and balance
  // ----------------------------------------------------------------
  app.get('/health', async (c) => {
    console.log(`[SERVER] GET /health`)

    const poolBalance = await payoutEngine.getPoolBalance()
    const counts = store.countByStatus()

    return c.json({
      status: 'ok',
      pool: {
        address: config.poolAddress,
        balance: `${poolBalance} pathUSD`,
      },
      policies: counts,
      network: {
        chainId: config.chainId,
        rpc: config.tempoRpcUrl,
      },
      config: {
        premium: `${config.premiumAmount} pathUSD`,
        payoutMultiplier: config.payoutMultiplier,
        delayThresholdMin: config.delayThresholdMin,
      },
    })
  })

  // ----------------------------------------------------------------
  // GET /policies  — List all policies (debug)
  // ----------------------------------------------------------------
  app.get('/policies', (c) => {
    return c.json({ policies: store.getAll() })
  })

  return app
}
