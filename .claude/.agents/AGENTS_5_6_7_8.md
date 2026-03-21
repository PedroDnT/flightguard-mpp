# AGENT 5 — In-Memory Policy Store (src/store.ts)

## Your Role
Write `src/store.ts`. This is the single in-memory data layer. No database, no file system. All CRUD for policies lives here.

---

## File: src/store.ts

```ts
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
```

---

## Completion Checklist
- [ ] `src/store.ts` written
- [ ] Singleton `store` exported
- [ ] All methods log with `[STORE]` prefix
- [ ] `npx tsc --noEmit` passes

---
---

# AGENT 6 — HTTP Server with MPP Gates (src/server.ts)

## Your Role
Write `src/server.ts`. This is the Hono HTTP server. It exposes two routes: a premium-gated `/insure` endpoint and a free `/policy/:id` status endpoint. It also exposes a `/health` endpoint.

---

## Critical MPP Pattern (use EXACTLY as shown)

```ts
// From mppx@0.4.5 real API:
import { Mppx, tempo } from 'mppx/server'

const mppx = Mppx.create({
  methods: [
    tempo({
      currency: '0x20c0000000000000000000000000000000000000',
      recipient: process.env.POOL_ADDRESS!,
    }),
  ],
})

// In route handler:
const r = await mppx.charge({ amount: '1.00' })(request)
if (r.status === 402) return r.challenge
return r.withReceipt(Response.json({ ... }))
```

---

## File: src/server.ts

```ts
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
```

---

## Completion Checklist
- [ ] `src/server.ts` written
- [ ] `buildServer(config)` exported (NOT started — that's index.ts)
- [ ] MPP gate on `/insure` using real mppx@0.4.5 API
- [ ] Returns 402 challenge when unpaid
- [ ] Flight validation before policy creation
- [ ] `/health` endpoint shows pool balance
- [ ] All routes log with `[SERVER]` prefix
- [ ] `npx tsc --noEmit` passes

---
---

# AGENT 7 — Flight Checker Cron (src/checker.ts)

## Your Role
Write `src/checker.ts`. This module runs on a timer (every 5 minutes by default). For each active policy, it checks the flight status and triggers payouts when the delay threshold is exceeded.

---

## File: src/checker.ts

```ts
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
```

---

## Completion Checklist
- [ ] `src/checker.ts` written
- [ ] `FlightChecker` class exported
- [ ] Handles: cancelled, delay≥threshold, terminal no-delay, in-progress
- [ ] Retries payout on next cycle if it fails
- [ ] Logs every decision with `[CHECKER]` prefix
- [ ] `npx tsc --noEmit` passes

---
---

# AGENT 8 — Entry Point, README & Demo Script

## Your Role
Write `index.ts` (entry point that wires everything together) and `README.md` (comprehensive demo guide). This is the final agent — everything else must be complete first.

---

## File: index.ts

```ts
// ============================================================
// FlightGuard MPP — Entry Point
// ============================================================

import 'dotenv/config'
import { serve } from '@hono/node-server'
import { buildServer } from './src/server.js'
import { FlightChecker } from './src/checker.js'
import type { AppConfig } from './src/types.js'

// ── Load and validate config ─────────────────────────────────

function loadConfig(): AppConfig {
  const required = [
    'POOL_PRIVATE_KEY',
    'POOL_ADDRESS',
    'RAPIDAPI_KEY',
  ]

  for (const key of required) {
    if (!process.env[key]) {
      console.error(`❌ Missing required env var: ${key}`)
      process.exit(1)
    }
  }

  return {
    tempoRpcUrl: process.env.TEMPO_RPC_URL ?? 'https://rpc.moderato.tempo.xyz',
    chainId: Number(process.env.CHAIN_ID ?? '42431'),
    pathUsdAddress: (process.env.PATHUSD_ADDRESS ?? '0x20c0000000000000000000000000000000000000') as `0x${string}`,
    poolPrivateKey: process.env.POOL_PRIVATE_KEY! as `0x${string}`,
    poolAddress: process.env.POOL_ADDRESS! as `0x${string}`,
    port: Number(process.env.PORT ?? '3000'),
    premiumAmount: process.env.PREMIUM_AMOUNT ?? '1.00',
    payoutMultiplier: Number(process.env.PAYOUT_MULTIPLIER ?? '5'),
    delayThresholdMin: Number(process.env.DELAY_THRESHOLD_MIN ?? '60'),
    checkIntervalMs: Number(process.env.CHECK_INTERVAL_MS ?? '300000'),
    rapidApiKey: process.env.RAPIDAPI_KEY!,
  }
}

// ── Boot ─────────────────────────────────────────────────────

const config = loadConfig()

console.log('╔══════════════════════════════════════════╗')
console.log('║       FlightGuard MPP — Starting         ║')
console.log('╚══════════════════════════════════════════╝')
console.log(`Network:   Tempo (chainId ${config.chainId})`)
console.log(`Pool:      ${config.poolAddress}`)
console.log(`Premium:   ${config.premiumAmount} pathUSD`)
console.log(`Payout:    ${config.payoutMultiplier}x premium`)
console.log(`Threshold: ${config.delayThresholdMin} min delay`)
console.log(`Poll:      every ${config.checkIntervalMs / 1000}s`)
console.log('')

const app = buildServer(config)
const checker = new FlightChecker(config)

serve({ fetch: app.fetch, port: config.port }, () => {
  console.log(`✅ Server running on http://localhost:${config.port}`)
  console.log(`   POST /insure       — buy a policy (MPP-gated)`)
  console.log(`   GET  /policy/:id   — check policy status`)
  console.log(`   GET  /health       — pool balance & stats`)
  console.log(`   GET  /policies     — all policies (debug)`)
  console.log('')
})

checker.start()

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n[SHUTDOWN] SIGTERM received')
  checker.stop()
  process.exit(0)
})
process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] SIGINT received')
  checker.stop()
  process.exit(0)
})
```

---

## File: README.md

Write the following README:

```markdown
# FlightGuard MPP

**Parametric flight delay insurance on [Tempo](https://tempo.xyz) using the [Machine Payments Protocol](https://mpp.dev).**

Built by [OCTO INTELIGÊNCIA DE DADOS LTDA](https://github.com/PedroDnT) for the Tempo MPP Hackathon.

---

## What Is This?

FlightGuard eliminates the traditional insurance claims process entirely.

1. **Pay premium** via MPP (one stablecoin micropayment, ~$1)
2. **Flight is monitored** automatically every 5 minutes via AeroDataBox
3. **Payout fires automatically** if departure delay exceeds 60 minutes — no claim required

No paperwork. No adjusters. No waiting. Pure parametric: data → condition → payment.

---

## How It Works

```
Agent/User                    FlightGuard Server              Tempo Blockchain
     |                               |                               |
     |-- POST /insure (MPP) -------->|                               |
     |   pays 1 pathUSD premium      |-- verify payment ------------>|
     |                               |<- payment confirmed ----------|
     |                               |-- fetch flight via AeroDataBox|
     |<-- { policyId, payoutAmt } ---|                               |
     |                               |                               |
     |                    [every 5 min: check flight]                |
     |                               |-- GET flight status           |
     |                               |   delay > 60min? YES          |
     |                               |-- transfer(payoutAddr, 5 USD) |
     |                               |                               |
     |<-- 5 pathUSD arrives -------->|                               |
```

---

## Setup

### 1. Prerequisites
- Node.js >= 18
- RapidAPI account (free) → [AeroDataBox API](https://rapidapi.com/aedbx-aedbx/api/aerodatabox)
- Tempo testnet wallet with pathUSD → [Faucet](https://docs.tempo.xyz/quickstart/faucet)

### 2. Install
```bash
npm install
```

### 3. Configure
```bash
cp .env.example .env
# Fill in POOL_PRIVATE_KEY, POOL_ADDRESS, RAPIDAPI_KEY
```

### 4. Fund the pool
Get testnet pathUSD from the [Tempo faucet](https://docs.tempo.xyz/quickstart/faucet) and send to your `POOL_ADDRESS`.

### 5. Start
```bash
npm start
```

---

## Demo Script

### Step 1 — Check pool is funded
```bash
curl http://localhost:3000/health
```

### Step 2 — Buy a policy (using mppx CLI)
```bash
# Install mppx CLI globally
npm i -g mppx

# Create a funded testnet account
mppx account create

# Buy insurance for a real flight
mppx http://localhost:3000/insure \
  --method POST \
  --data '{"flightNumber":"LA3251","date":"2026-03-19","payoutAddress":"0xYourWalletHere"}'
```

### Step 3 — Check your policy
```bash
curl http://localhost:3000/policy/{policyId}
```

### Step 4 — Watch the checker
Watch the terminal — every 5 minutes you'll see:
```
[CHECKER] Checking 1 active policy(ies)
[CHECKER] Checking policy abc-123...
[CHECKER]   Flight: LA3251 on 2026-03-19
[CHECKER]   Status:  Departed
[CHECKER]   Delay:   75 minutes
[CHECKER]   → Delay 75min ≥ threshold 60min — TRIGGERING PAYOUT
[PAYOUT] ✅ CONFIRMED in block 1234567
```

### Step 5 — Verify payout on explorer
`https://explore.testnet.tempo.xyz/tx/{txHash}`

---

## Underwriting Note

In this demo, the **pool wallet acts as the sole insurer**. The pool must be pre-funded with enough pathUSD to cover potential payouts. For production, underwriting could be:
- A DAO liquidity pool (stakers earn premium yield)
- A reinsurance API integration
- Overcollateralized stablecoin vault

---

## Architecture

```
index.ts          — Boot: loads config, starts server + checker
src/types.ts      — All TypeScript types and constants
src/flight.ts     — AeroDataBox API wrapper
src/payout.ts     — Tempo pathUSD transfer engine (viem)
src/store.ts      — In-memory policy store
src/server.ts     — Hono HTTP server with MPP-gated routes
src/checker.ts    — Cron: polls flights, triggers payouts
```

---

## Network

| Property | Testnet | Mainnet |
|---|---|---|
| Chain ID | 42431 | 4217 |
| RPC | rpc.moderato.tempo.xyz | rpc.tempo.xyz |
| Explorer | explore.testnet.tempo.xyz | explore.tempo.xyz |
| pathUSD | `0x20c000...` | `0x20c000...` |

---

## License
MIT — OCTO INTELIGÊNCIA DE DADOS LTDA
```

---

## Final Completion Checklist (ALL AGENTS)

Run this before demo:

```bash
# 1. Type check
npx tsc --noEmit

# 2. Start server
npm start

# 3. Health check
curl http://localhost:3000/health

# 4. Buy a policy (requires funded mppx account)
mppx http://localhost:3000/insure \
  --method POST \
  --data '{"flightNumber":"LA3251","date":"2026-03-19","payoutAddress":"0x..."}'

# 5. Verify policy created
curl http://localhost:3000/policies
```

Expected terminal output on startup:
```
╔══════════════════════════════════════════╗
║       FlightGuard MPP — Starting         ║
╚══════════════════════════════════════════╝
✅ Server running on http://localhost:3000
[CHECKER] Starting — interval: 300000ms, delay threshold: 60min
[CHECKER] No active policies to check
```
