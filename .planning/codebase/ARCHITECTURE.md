# Architecture

*Last updated: 2026-03-23*

## Pattern: Off-Chain Oracle + MPP-Gated HTTP API

FlightGuard is a **parametric insurance microservice** combining:
- An MPP-gated HTTP API (Hono + mppx) that sells policies
- An autonomous polling loop (`FlightChecker`) that monitors flights and fires payouts in parallel
- Direct ERC-20 transfers on Tempo for payouts (no on-chain oracle call)
- JSON file persistence so policies survive restarts

The server acts as a trusted off-chain oracle: it decides when delay thresholds are met, then executes the payout unilaterally from the pool wallet.

---

## Module Layers

```
index.ts                    ← entry point: config, server + checker bootstrap
├── src/server.ts           ← Hono HTTP layer (routes, MPP gating, rate limiter, validation)
├── src/checker.ts          ← Polling cron (setInterval, parallel flight checks, TTL cleanup)
├── src/flight.ts           ← AeroDataBox adapter (fetch + normalize + 4-min cache)
├── src/payout.ts           ← Tempo/viem payout engine (ERC-20 transfer)
├── src/store.ts            ← Policy store (Map singleton + JSON file persistence)
└── src/types.ts            ← Shared types, interfaces, constants
```

### Dependency Graph

```
                    ┌─────────────────┐
                    │    index.ts     │
                    │  (entry point)  │
                    └────────┬────────┘
               ┌─────────────┴─────────────┐
               ▼                           ▼
        ┌─────────────┐           ┌────────────────┐
        │  server.ts  │           │  checker.ts    │
        │  HTTP + MPP │           │  cron + payout │
        └──────┬──────┘           └───────┬────────┘
               │                          │
         ┌─────┴──────────────────────────┤
         ▼                                ▼
  ┌──────────────────┐           ┌──────────────────┐
  │    flight.ts     │           │    store.ts      │
  │  ADB API + cache │           │  Map + .json     │
  └──────────┬───────┘           └──────────────────┘
             │                            ▲
             ▼                            │
    ┌─────────────────┐          ┌────────────────┐
    │  AeroDataBox    │          │   payout.ts    │──► Tempo Chain
    │  RapidAPI       │          │  viem ERC-20   │     (pathUSD)
    └─────────────────┘          └────────────────┘
```

---

## Data Flow: Policy Purchase

```
Client → POST /insure
  → mppx.charge()                ← 402 if no payment
  → checkRateLimit(ip)           ← 429 if >10 req/60s
  → validate inputs              ← 400 on bad flightNumber/date/address
  → fetchFlightInfo()            ← AeroDataBox: verify flight exists (cached)
  → store.create()               ← create Policy with status=active, save to disk
  → r.withReceipt(201)           ← return policyId + MPP receipt
```

## Data Flow: Automated Payout

```
FlightChecker (setInterval every checkIntervalMs)
  → store.cleanup(7d)                  ← prune old terminal policies
  → store.getActive()                  ← get all active policies
  Promise.allSettled([...]) parallel:
    → fetchFlightInfo()                ← AeroDataBox (4-min cache)
    → getDepartureDelayMinutes()       ← extract delay
    → hasFlightDeparted()              ← check departed status
    → isFlightTerminal()               ← check terminal state

    CASE: Cancelled
        → store.markExpired()
    CASE: departed + delay ≥ threshold
        → store.update(paid_out)       ← pre-lock to prevent double-spend
        → PayoutEngine.sendPayout()    ← ERC-20 transfer on Tempo
          success → store.markPaidOut(txHash)
          failure → store.update(active) ← rollback; retry next cycle
    CASE: terminal + delay < threshold
        → store.markExpired()
    CASE: in-progress
        → store.recordCheck()          ← keep active, retry next cycle
```

---

## Key Abstractions

### `AppConfig` (`src/types.ts`)
Central config object loaded from environment at startup. Passed by reference to all modules. Single source of truth for network params, insurance parameters, and API keys. Immutable after boot.

### `PolicyStore` (`src/store.ts`)
Exported class + singleton. `Map<string, Policy>` loaded from disk on construction. Every mutation (`create`, `update`, `cleanup`) calls `saveToDisk()` synchronously. Accepts optional `storePath` constructor arg for test isolation. Provides `cleanup(maxAgeMs)` to prune stale terminal policies.

### `PayoutEngine` (`src/payout.ts`)
Stateless payout executor. Creates fresh viem clients per call. Checks pool balance before transfer. Returns `PayoutResult` with `txHash` on success or `error` string on failure. Never throws to caller.

### `FlightChecker` (`src/checker.ts`)
Cron-style class. Runs immediately on `start()`, then on interval. Calls `store.cleanup()` before each cycle. Processes policies **in parallel** via `Promise.allSettled`. `stop()` clears the interval for graceful shutdown.

### `buildServer()` (`src/server.ts`)
Factory function returning a `Hono` instance. Module-level rate limiter (`rateLimitMap`) shared across all requests. Takes `AppConfig`, creates `PayoutEngine` and `Mppx` internally. `index.ts` owns the Node HTTP server; `server.ts` owns the Hono app logic.

### Flight cache (`src/flight.ts`)
Module-level `flightCache: Map<string, {data, fetchedAt}>`. TTL of 4 minutes. Keys by `${flightNumber}:${date}`. Both found and not-found (null) results are cached to avoid redundant API calls within a checker cycle.

---

## Error Handling

| Layer | Strategy |
|---|---|
| `server.ts` | Try/catch around flight fetch and JSON parse; typed HTTP error responses; generic 503 for AeroDataBox errors |
| `checker.ts` | `Promise.allSettled` — one failed policy doesn't stop the cycle; rollback to `active` on failed payout |
| `payout.ts` | Returns `PayoutResult` — never throws to caller; failed payouts retry next cycle via rollback |
| `flight.ts` | 404 → null (cached); non-200 → throw with status; cache errors are non-fatal |
| `store.ts` | `saveToDisk` errors logged but non-fatal; `loadFromDisk` failure starts with empty map |
| `index.ts` | Missing required env vars → `process.exit(1)` at boot |

---

## Entry Points

| Entry | Purpose |
|---|---|
| `index.ts` | Main process — loads config, starts HTTP server + checker |
| `npm run dev` | `tsx watch index.ts` — hot reload dev server |
| `npm start` | `tsx index.ts` — production single run |
| `npm run build` | `tsc` — compiles to `dist/`, entry becomes `dist/index.js` |
| `npm test` | `vitest run` — unit tests |

---

## Graceful Shutdown

`SIGTERM` and `SIGINT` handlers in `index.ts` call `checker.stop()` before `process.exit(0)`, clearing the polling interval cleanly.
