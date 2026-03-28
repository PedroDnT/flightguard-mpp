# FlightGuard MPP — Fix Plan

**Goal:** Resolve all critical and high-severity issues identified in CONCERNS.md, plus key medium-severity issues.

**Skipped:** #8 (unstructured logging) — low ROI for hackathon scope.

---

## Wave 1 — Independent fixes (run in parallel)

These touch different files and have no interdependencies.

---

### Plan A — Verify & fix arrival `actualTime` bug

**File:** `src/flight.ts`

**Task:** Audit `normalizeFlightInfo`. CONCERNS.md claims `arrival.actualTime` reads from `scheduledTime` fields instead of `actualTime`. Current code at lines 121-125 appears to already read `raw.arrival.actualTime.local/utc` correctly — verify this is not a stale concern, and fix if it is.

**Read first:**
- `src/flight.ts` (full file)
- `src/types.ts` (FlightAirport interface)

**Action:**
1. Read `normalizeFlightInfo` function in full.
2. Check lines 121-125: the `arrival.actualTime` block must read `raw.arrival.actualTime.local` and `raw.arrival.actualTime.utc` (not `raw.arrival.scheduledTime.*`).
3. If correct: add a comment `// verified: reads actualTime, not scheduledTime` above the block.
4. If wrong: fix to read `raw.arrival.actualTime.local ?? ''` and `raw.arrival.actualTime.utc ?? ''`.

**Acceptance criteria:**
- `src/flight.ts` contains `raw.arrival.actualTime.local` (not `raw.arrival.scheduledTime.local` in the actualTime block)
- `src/flight.ts` contains `raw.arrival.actualTime.utc` (not `raw.arrival.scheduledTime.utc` in the actualTime block)

---

### Plan B — Rate limiting on `/insure`

**File:** `src/server.ts`

**Task:** Add a simple in-memory IP-based rate limiter to `POST /insure`. No external package — implement inline using a `Map<string, {count: number, windowStart: number}>`.

**Read first:**
- `src/server.ts` (full file)

**Action:**
Add a rate limiter before the `/insure` handler. Limit: **10 requests per IP per 60 seconds**.

Implementation to add at the top of `buildServer`, before route definitions:

```typescript
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
```

In the `/insure` handler, after the MPP payment check and before body parsing, add:

```typescript
const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown'
if (!checkRateLimit(ip)) {
  return c.json({ error: 'Too many requests' }, 429)
}
```

**Acceptance criteria:**
- `src/server.ts` contains `rateLimitMap`
- `src/server.ts` contains `return c.json({ error: 'Too many requests' }, 429)`
- `src/server.ts` contains `RATE_LIMIT_MAX = 10`
- `src/server.ts` contains `RATE_LIMIT_WINDOW_MS = 60_000`

---

### Plan C — Parallel policy checks in checker

**File:** `src/checker.ts`

**Task:** Replace the sequential `for...await` loop in `runCycle()` with `Promise.allSettled` to check all active policies concurrently.

**Read first:**
- `src/checker.ts` (full file)

**Action:**
Replace the `for (const policy of active)` loop in `runCycle()`:

```typescript
// BEFORE:
for (const policy of active) {
  try {
    const result = await this.checkPolicy(policy.id)
    if (result) results.push(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[CHECKER] Error checking policy ${policy.id}: ${msg}`)
  }
}

// AFTER:
const settled = await Promise.allSettled(
  active.map((policy) => this.checkPolicy(policy.id))
)
for (const outcome of settled) {
  if (outcome.status === 'fulfilled' && outcome.value) {
    results.push(outcome.value)
  } else if (outcome.status === 'rejected') {
    console.error(`[CHECKER] Error checking policy: ${outcome.reason}`)
  }
}
```

**Acceptance criteria:**
- `src/checker.ts` contains `Promise.allSettled`
- `src/checker.ts` does NOT contain `for (const policy of active)` (the old sequential loop is gone)
- `src/checker.ts` contains `outcome.status === 'fulfilled'`

---

### Plan D — Policy TTL cleanup

**File:** `src/store.ts`

**Task:** Add a `cleanup(maxAgeMs: number)` method to `PolicyStore` that removes terminal policies (status `paid_out`, `expired`, `cancelled`) older than `maxAgeMs`. Call it at the start of each `runCycle()` in the checker with a 7-day TTL.

**Read first:**
- `src/store.ts` (full file)
- `src/checker.ts` (to know where to call cleanup)
- `src/types.ts` (PolicyStatus type)

**Action:**

Add to `PolicyStore` class in `src/store.ts`:

```typescript
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
  }
  return removed
}
```

In `src/checker.ts`, at the top of `runCycle()`, before `const active = store.getActive()`:

```typescript
// Clean up terminal policies older than 7 days
store.cleanup(7 * 24 * 60 * 60 * 1000)
```

**Acceptance criteria:**
- `src/store.ts` contains `cleanup(maxAgeMs: number): number`
- `src/store.ts` contains `terminal.includes(policy.status) && policy.updatedAt < cutoff`
- `src/checker.ts` contains `store.cleanup(7 * 24 * 60 * 60 * 1000)`
- `npm run typecheck` exits 0

---

## Wave 2 — Depends on Wave 1

---

### Plan E — JSON file persistence

**File:** `src/store.ts`

**Task:** Persist the policy store to a JSON file (`policies.json` in the project root, path configurable via `STORE_PATH` env var). Load on startup. Save after every mutation. Lose nothing on restart.

**Read first:**
- `src/store.ts` (full file — including any Wave 1 cleanup() changes)
- `src/types.ts` (Policy type)
- `index.ts` (to understand startup sequence)

**Action:**

1. At the top of `src/store.ts`, add:
```typescript
import { readFileSync, writeFileSync, existsSync } from 'fs'

const STORE_PATH = process.env.STORE_PATH ?? 'policies.json'

function loadFromDisk(): Map<string, Policy> {
  try {
    if (!existsSync(STORE_PATH)) return new Map()
    const raw = readFileSync(STORE_PATH, 'utf-8')
    const entries = JSON.parse(raw) as [string, Policy][]
    console.log(`[STORE] Loaded ${entries.length} policy(ies) from ${STORE_PATH}`)
    return new Map(entries)
  } catch (err) {
    console.error(`[STORE] Failed to load from disk: ${err}. Starting fresh.`)
    return new Map()
  }
}

function saveToDisk(policies: Map<string, Policy>): void {
  try {
    writeFileSync(STORE_PATH, JSON.stringify(Array.from(policies.entries()), null, 2))
  } catch (err) {
    console.error(`[STORE] Failed to save to disk: ${err}`)
  }
}
```

2. Change the class initialization:
```typescript
// BEFORE:
private policies: Map<string, Policy> = new Map()

// AFTER:
private policies: Map<string, Policy> = loadFromDisk()
```

3. Call `saveToDisk(this.policies)` at the end of: `create()`, `update()`, and `cleanup()`.

4. Add `STORE_PATH` to `.env.example`:
```
STORE_PATH=policies.json
```

5. Add `policies.json` to `.gitignore`.

**Acceptance criteria:**
- `src/store.ts` contains `loadFromDisk()`
- `src/store.ts` contains `saveToDisk(`
- `src/store.ts` contains `private policies: Map<string, Policy> = loadFromDisk()`
- `src/store.ts` `create()` calls `saveToDisk(this.policies)` before returning
- `src/store.ts` `update()` calls `saveToDisk(this.policies)` before returning
- `.env.example` contains `STORE_PATH=`
- `.gitignore` contains `policies.json`
- `npm run typecheck` exits 0

---

### Plan F — Flight data cache

**File:** `src/flight.ts`

**Task:** Add an in-memory cache for AeroDataBox responses. Key: `${flightNumber}:${date}`. TTL: 4 minutes (slightly under the 5-minute check interval). This reduces API calls and provides resilience when the same flight is checked multiple times per cycle.

**Read first:**
- `src/flight.ts` (full file)

**Action:**

Add at the top of `src/flight.ts`, before `fetchFlightInfo`:

```typescript
// In-memory cache for AeroDataBox responses (4min TTL)
const FLIGHT_CACHE_TTL_MS = 4 * 60 * 1000
const flightCache = new Map<string, { data: FlightInfo | null; fetchedAt: number }>()

function getCached(key: string): FlightInfo | null | undefined {
  const entry = flightCache.get(key)
  if (!entry) return undefined
  if (Date.now() - entry.fetchedAt > FLIGHT_CACHE_TTL_MS) {
    flightCache.delete(key)
    return undefined
  }
  return entry.data
}
```

Modify `fetchFlightInfo` to check and populate the cache:

```typescript
export async function fetchFlightInfo(
  flightNumber: string,
  date: string,
  rapidApiKey: string,
): Promise<FlightInfo | null> {
  const cacheKey = `${flightNumber}:${date}`

  // Check cache first
  const cached = getCached(cacheKey)
  if (cached !== undefined) {
    console.log(`[FLIGHT] Cache hit for ${flightNumber} on ${date}`)
    return cached
  }

  // ... existing fetch logic unchanged ...

  // Before returning, store in cache:
  flightCache.set(cacheKey, { data: result, fetchedAt: Date.now() })
  return result
}
```

Both the `null` (not found) and the normalized `FlightInfo` result must be cached (to avoid re-hitting the API for a known-missing flight).

**Acceptance criteria:**
- `src/flight.ts` contains `flightCache`
- `src/flight.ts` contains `FLIGHT_CACHE_TTL_MS = 4 * 60 * 1000`
- `src/flight.ts` contains `Cache hit for`
- `src/flight.ts` caches null results (line containing `flightCache.set` appears before each `return null` path OR there is a unified return path)
- `npm run typecheck` exits 0

---

## Wave 3 — Tests (after all fixes)

---

### Plan G — Test suite

**Task:** Add vitest and write unit tests covering all pure functions and the known-bug scenarios. No mocking of the store or payout engine.

**Read first:**
- `src/flight.ts` (functions to test: `getDepartureDelayMinutes`, `hasFlightDeparted`, `isFlightTerminal`, `normalizeStatus` via `fetchFlightInfo`)
- `src/store.ts` (create, update, markPaidOut, markExpired, cleanup)
- `src/server.ts` (payout amount calculation logic)
- `package.json` (to add vitest)

**Action:**

1. Install vitest:
```bash
npm install --save-dev vitest
```

2. Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

3. Create `test/flight.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  getDepartureDelayMinutes,
  hasFlightDeparted,
  isFlightTerminal,
} from '../src/flight.js'
import type { FlightInfo } from '../src/types.js'

function makeFlightInfo(overrides: Partial<FlightInfo> = {}): FlightInfo {
  return {
    number: 'LA3251',
    status: 'Scheduled',
    departure: {
      iata: 'GRU',
      name: 'Guarulhos',
      delays: [],
    },
    arrival: {
      iata: 'GIG',
      name: 'Galeão',
    },
    ...overrides,
  }
}

describe('getDepartureDelayMinutes', () => {
  it('returns 0 when no delays', () => {
    expect(getDepartureDelayMinutes(makeFlightInfo())).toBe(0)
  })
  it('returns first delay minutes', () => {
    const f = makeFlightInfo({ departure: { iata: 'GRU', name: 'GRU', delays: [{ minutes: 75 }] } })
    expect(getDepartureDelayMinutes(f)).toBe(75)
  })
  it('returns 0 when delays array is empty', () => {
    const f = makeFlightInfo({ departure: { iata: 'GRU', name: 'GRU', delays: [] } })
    expect(getDepartureDelayMinutes(f)).toBe(0)
  })
})

describe('hasFlightDeparted', () => {
  it('returns false for Scheduled', () => {
    expect(hasFlightDeparted(makeFlightInfo({ status: 'Scheduled' }))).toBe(false)
  })
  it('returns true for Departed', () => {
    expect(hasFlightDeparted(makeFlightInfo({ status: 'Departed' }))).toBe(true)
  })
  it('returns true for Landed', () => {
    expect(hasFlightDeparted(makeFlightInfo({ status: 'Landed' }))).toBe(true)
  })
  it('returns false for Cancelled', () => {
    expect(hasFlightDeparted(makeFlightInfo({ status: 'Cancelled' }))).toBe(false)
  })
})

describe('isFlightTerminal', () => {
  it('returns false for Scheduled', () => {
    expect(isFlightTerminal(makeFlightInfo({ status: 'Scheduled' }))).toBe(false)
  })
  it('returns true for Landed', () => {
    expect(isFlightTerminal(makeFlightInfo({ status: 'Landed' }))).toBe(true)
  })
  it('returns true for Cancelled', () => {
    expect(isFlightTerminal(makeFlightInfo({ status: 'Cancelled' }))).toBe(true)
  })
  it('returns true for Diverted', () => {
    expect(isFlightTerminal(makeFlightInfo({ status: 'Diverted' }))).toBe(true)
  })
})
```

4. Create `test/store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'

// Re-export a fresh store for each test by re-importing
// (vitest isolates modules per test file by default)
describe('PolicyStore', () => {
  // Import inline to get a fresh module per describe block
  it('creates a policy with correct defaults', async () => {
    const { store } = await import('../src/store.js')
    const policy = store.create({
      req: { flightNumber: 'LA3251', date: '2026-04-01', payoutAddress: '0x' + 'a'.repeat(40) },
      premiumAmount: '1.00',
      payoutAmount: '5.00',
      scheduledDeparture: '2026-04-01T10:00:00Z',
    })
    expect(policy.status).toBe('active')
    expect(policy.flightNumber).toBe('LA3251')
    expect(policy.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('markPaidOut sets status and txHash', async () => {
    const { store } = await import('../src/store.js')
    const policy = store.create({
      req: { flightNumber: 'LA0001', date: '2026-04-01', payoutAddress: '0x' + 'b'.repeat(40) },
      premiumAmount: '1.00',
      payoutAmount: '5.00',
      scheduledDeparture: '',
    })
    const updated = store.markPaidOut(policy.id, '0xdeadbeef')
    expect(updated?.status).toBe('paid_out')
    expect(updated?.payoutTxHash).toBe('0xdeadbeef')
  })

  it('cleanup removes old terminal policies', async () => {
    const { store } = await import('../src/store.js')
    const policy = store.create({
      req: { flightNumber: 'LA0002', date: '2026-04-01', payoutAddress: '0x' + 'c'.repeat(40) },
      premiumAmount: '1.00',
      payoutAmount: '5.00',
      scheduledDeparture: '',
    })
    store.markExpired(policy.id)
    // Backdate updatedAt
    const p = store.get(policy.id)!
    ;(p as any).updatedAt = Date.now() - 8 * 24 * 60 * 60 * 1000
    const removed = store.cleanup(7 * 24 * 60 * 60 * 1000)
    expect(removed).toBe(1)
    expect(store.get(policy.id)).toBeUndefined()
  })
})
```

5. Add to `package.json` a `"type": "module"` check — if not present, vitest config needs `environment: 'node'`. Add `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
```

**Acceptance criteria:**
- `package.json` contains `"vitest"` in devDependencies
- `package.json` scripts contains `"test": "vitest run"`
- `test/flight.test.ts` exists
- `test/store.test.ts` exists
- `npm test` exits 0 (all tests pass)
- `npm run typecheck` exits 0

---

## Execution order

```
Wave 1 (parallel): Plan A, Plan B, Plan C, Plan D
Wave 2 (parallel): Plan E, Plan F
Wave 3:            Plan G
```

**Total files modified:** `src/flight.ts`, `src/server.ts`, `src/checker.ts`, `src/store.ts`, `.env.example`, `.gitignore`, `package.json` + new: `test/flight.test.ts`, `test/store.test.ts`, `vitest.config.ts`
