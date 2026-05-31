// ============================================================
// FlightGuard MPP — Hono HTTP Server
// Routes:
//   POST /insure        MPP-gated: buy insurance policy
//   GET  /policy/:id    Free: check policy status
//   GET  /health        Free: pool balance + stats
// ============================================================

import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { serveStatic } from '@hono/node-server/serve-static'
import { Mppx, tempo } from 'mppx/server'
import { useFacilitator } from 'x402/verify'
import { store } from './store.js'
import { fetchFlightInfo, getScheduledDepartureUtc } from './flight.js'
import { PayoutEngine } from './payout.js'
import type { AlchemyClient } from './alchemy.js'
import type { AppConfig, InsureRequest, InsureResponse, PolicyResponse } from './types.js'

// Simple in-memory rate limiter: 10 req / 60s per IP
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60_000

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX) return false
  entry.count++
  return true
}

function clientIp(c: { req: { header: (k: string) => string | undefined } }): string {
  return c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown'
}

// Validate insure request inputs. Returns an error string, or null if valid.
// Shared by both the MPP and x402 payment paths so they enforce identical rules.
function validateInsureInputs(body: Partial<InsureRequest>): string | null {
  const { flightNumber, date, payoutAddress } = body
  if (!flightNumber || !date || !payoutAddress) {
    return 'Missing required fields: flightNumber, date, payoutAddress'
  }
  if (!/^[A-Z0-9]{2,8}$/i.test(flightNumber)) {
    return 'Invalid flight number format (e.g. LA3251)'
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return 'date must be YYYY-MM-DD'
  }
  const parsedDate = new Date(date + 'T00:00:00Z')
  if (
    isNaN(parsedDate.getTime()) ||
    parsedDate.getUTCMonth() + 1 !== parseInt(date.slice(5, 7), 10) ||
    parsedDate.getUTCDate() !== parseInt(date.slice(8, 10), 10)
  ) {
    return 'date is not a valid calendar date'
  }
  const todayUtc = new Date()
  todayUtc.setUTCHours(0, 0, 0, 0)
  if (parsedDate < todayUtc) {
    return 'date must not be in the past'
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(payoutAddress)) {
    return 'payoutAddress must be a valid EVM address'
  }
  return null
}

export function buildServer(config: AppConfig, alchemy: AlchemyClient | null = null): Hono {
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
  // Cost: config.premiumAmount via MPP (pathUSD) or x402 (Base USDC)
  // ----------------------------------------------------------------
  app.post('/insure', bodyLimit({ maxSize: 1024 }), async (c) => {
    console.log(`[SERVER] POST /insure`)

    // ── x402 path (Base USDC) ───────────────────────────────────
    const xPaymentHeader = c.req.header('x-payment')
    const preferX402 = c.req.header('prefer')?.toLowerCase().includes('payment=x402')

    if ((xPaymentHeader || preferX402) && config.baseNetwork && config.baseUsdcAddress) {
      const premiumAtoms = String(Math.round(parseFloat(config.premiumAmount) * 1_000_000))
      const resource = `${config.baseUrl ?? 'http://localhost:' + config.port}/insure` as `${string}://${string}`
      const requirements = {
        scheme: 'exact' as const,
        network: config.baseNetwork as 'base-sepolia' | 'base',
        maxAmountRequired: premiumAtoms,
        resource,
        description: `FlightGuard insurance — ${config.premiumAmount} USDC premium`,
        mimeType: 'application/json',
        payTo: config.poolAddress,
        maxTimeoutSeconds: 300,
        asset: config.baseUsdcAddress,
      }

      // No payment header yet → issue 402 challenge
      if (!xPaymentHeader) {
        console.log(`[SERVER] x402 402 — awaiting Base USDC payment`)
        return c.json(
          { x402Version: 1, accepts: [requirements], error: 'Payment Required' },
          402,
          { 'Content-Type': 'application/json' },
        )
      }

      // Payment header present → verify then settle
      try {
        const payload = JSON.parse(Buffer.from(xPaymentHeader, 'base64').toString('utf8'))
        const { verify: x402verify, settle: x402settle } = useFacilitator()
        const verifyResult = await x402verify(payload, requirements)
        if (!verifyResult.isValid) {
          console.log(`[SERVER] x402 verify failed: ${verifyResult.invalidReason}`)
          return c.json({ error: 'Payment verification failed', reason: verifyResult.invalidReason }, 402)
        }
        console.log(`[SERVER] x402 payment verified`)

        // Rate limit (checked after payment verification to prevent probing)
        if (!checkRateLimit(clientIp(c))) {
          return c.json({ error: 'Too many requests' }, 429)
        }

        let body: InsureRequest
        try { body = await c.req.json<InsureRequest>() } catch {
          return c.json({ error: 'Invalid JSON body' }, 400)
        }
        const validationError = validateInsureInputs(body)
        if (validationError) return c.json({ error: validationError }, 400)
        const { flightNumber, date, payoutAddress } = body

        let flightInfo
        try {
          flightInfo = await fetchFlightInfo(flightNumber, date, config.rapidApiKey)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error(`[SERVER] Flight lookup failed: ${msg}`)
          return c.json({ error: 'Flight data unavailable' }, 503)
        }
        if (!flightInfo)
          return c.json({ error: `Flight ${flightNumber} not found for date ${date}` }, 404)

        const scheduledDeparture = getScheduledDepartureUtc(flightInfo)
        const premiumCents = BigInt(Math.round(parseFloat(config.premiumAmount) * 100))
        const payoutAmount = (Number(premiumCents * BigInt(config.payoutMultiplier)) / 100).toFixed(2)

        // Settle BEFORE creating the policy — no pool revenue means no policy
        const settleResult = await x402settle(payload, requirements)
        if (!settleResult.success) {
          console.error(`[SERVER] x402 settle failed: ${settleResult.errorReason}`)
          return c.json({ error: 'Payment settlement failed', reason: settleResult.errorReason }, 402)
        }
        console.log(`[SERVER] x402 payment settled`)

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

        console.log(`[SERVER] ✅ Policy issued via x402: ${policy.id}`)
        return c.json(response, 201, { 'X-Payment-Response': 'settled' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[SERVER] x402 error: ${msg}`)
        return c.json({ error: 'Payment processing failed' }, 402)
      }
    }

    // ── MPP path (Tempo pathUSD) ────────────────────────────────
    const r = await mppx.charge({ amount: config.premiumAmount })(c.req.raw)
    if (r.status === 402) {
      console.log(`[SERVER] 402 — awaiting MPP payment`)
      return r.challenge
    }

    // Rate limit
    if (!checkRateLimit(clientIp(c))) {
      return c.json({ error: 'Too many requests' }, 429)
    }

    // Parse body
    let body: InsureRequest
    try {
      body = await c.req.json<InsureRequest>()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }

    // Validate inputs
    const validationError = validateInsureInputs(body)
    if (validationError) return c.json({ error: validationError }, 400)

    const { flightNumber, date, payoutAddress } = body

    console.log(`[SERVER] Insuring flight ${flightNumber} on ${date} → ${payoutAddress}`)

    // Check policyholder balance via Alchemy Portfolio API (best-effort, non-blocking)
    if (alchemy) {
      const balance = await alchemy.getPathUsdBalance(payoutAddress, config.pathUsdAddress)
      if (balance !== null) {
        console.log(`[SERVER] Policyholder ${payoutAddress} pathUSD balance: ${balance}`)
      }
    }

    // Verify flight exists
    let flightInfo
    try {
      flightInfo = await fetchFlightInfo(flightNumber, date, config.rapidApiKey)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[SERVER] Flight lookup failed: ${msg}`)
      return c.json({ error: 'Flight data unavailable' }, 503)
    }

    if (!flightInfo) {
      return c.json(
        { error: `Flight ${flightNumber} not found for date ${date}` },
        404,
      )
    }

    const scheduledDeparture = getScheduledDepartureUtc(flightInfo)
    const premiumCents = BigInt(Math.round(parseFloat(config.premiumAmount) * 100))
    const payoutAmount = (Number(premiumCents * BigInt(config.payoutMultiplier)) / 100).toFixed(2)

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
  // GET /flight-lookup  — Proxy AeroDataBox flight search (keeps API key server-side)
  // ----------------------------------------------------------------
  app.get('/flight-lookup', async (c) => {
    // Rate limit — this route proxies the metered AeroDataBox/RapidAPI quota
    if (!checkRateLimit(clientIp(c))) {
      return c.json({ error: 'Too many requests' }, 429)
    }

    const flight = c.req.query('flight')?.trim().toUpperCase()
    const date = c.req.query('date')?.trim()

    if (!flight || !date) {
      return c.json({ error: 'flight and date query params required' }, 400)
    }
    if (!/^[A-Z0-9]{2,8}$/i.test(flight)) {
      return c.json({ error: 'Invalid flight number format' }, 400)
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json({ error: 'date must be YYYY-MM-DD' }, 400)
    }

    try {
      const info = await fetchFlightInfo(flight, date, config.rapidApiKey)
      if (!info) return c.json({ error: `Flight ${flight} not found for ${date}` }, 404)
      return c.json({ flight: info })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[SERVER] Flight lookup error: ${msg}`)
      return c.json({ error: 'Flight data unavailable' }, 503)
    }
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
  // POST /demo/policy  — Create a synthetic policy (no MPP, no real flight)
  // ----------------------------------------------------------------
  app.post('/demo/policy', async (c) => {
    const departureTime = new Date(Date.now() + 2 * 60 * 1000) // departs in 2 min
    const date = departureTime.toISOString().slice(0, 10)
    const payoutAmount = (parseFloat(config.premiumAmount) * config.payoutMultiplier).toFixed(2)

    const policy = store.create({
      req: {
        flightNumber: 'DEMO01',
        date,
        payoutAddress: '0x000000000000000000000000000000000000dEaD',
      },
      premiumAmount: config.premiumAmount,
      payoutAmount,
      scheduledDeparture: departureTime.toISOString(),
      isDemo: true,
    })

    console.log(`[DEMO] Policy created: ${policy.id}`)
    return c.json({ policyId: policy.id, policy }, 201)
  })

  // ----------------------------------------------------------------
  // POST /demo/policy/:id/resolve  — Resolve demo policy (delayed or ontime)
  // ----------------------------------------------------------------
  app.post('/demo/policy/:id/resolve', async (c) => {
    const id = c.req.param('id')
    const policy = store.get(id)
    if (!policy) return c.json({ error: 'Policy not found' }, 404)
    if (!policy.isDemo) return c.json({ error: 'Not a demo policy' }, 403)

    let body: { scenario?: string } = {}
    try { body = (await c.req.json()) || {} } catch {}

    if (body.scenario === 'ontime') {
      store.markExpired(id)
      console.log(`[DEMO] Policy ${id} resolved: on-time (expired)`)
    } else {
      const fakeTxHash = '0x' + Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16),
      ).join('')
      store.markPaidOut(id, fakeTxHash)
      console.log(`[DEMO] Policy ${id} resolved: delayed (paid_out) tx=${fakeTxHash}`)
    }

    return c.json({ policy: store.get(id) })
  })

  // Serve the purchase UI from public/ — registered last so API routes take priority
  app.use('/*', serveStatic({ root: './public' }))

  return app
}
