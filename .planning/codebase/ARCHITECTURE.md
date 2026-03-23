# Architecture

## Pattern: Off-Chain Oracle + MPP-Gated HTTP API

FlightGuard is a **parametric insurance microservice** combining:
- An MPP-gated HTTP API (Hono + mppx) that sells policies
- An autonomous polling loop (`FlightChecker`) that monitors flights and fires payouts
- Direct ERC-20 transfers on Tempo for payouts (no on-chain oracle call)

The server acts as a trusted off-chain oracle: it decides when delay thresholds are met, then executes the payout unilaterally from the pool wallet.

---

## Layers

```
index.ts                    ← entry point: config, server + checker bootstrap
├── src/server.ts           ← Hono HTTP layer (routes, MPP gating, validation)
├── src/checker.ts          ← Polling cron (setInterval, flight checks, payout triggers)
├── src/flight.ts           ← AeroDataBox adapter (fetch + normalize flight data)
├── src/payout.ts           ← Tempo/viem payout engine (ERC-20 transfer)
├── src/store.ts            ← In-memory policy store (Map<id, Policy> singleton)
└── src/types.ts            ← Shared types, interfaces, constants
```

---

## Data Flow: Policy Purchase

```
Client → POST /insure
  → mppx.charge()          ← 402 if no payment
  → fetchFlightInfo()      ← AeroDataBox: verify flight exists
  → store.create()         ← create Policy with status=active
  → r.withReceipt(201)     ← return policyId + MPP receipt
```

## Data Flow: Automated Payout

```
FlightChecker (setInterval every checkIntervalMs)
  → store.getActive()                  ← get all active policies
  for each policy (sequential):
    → fetchFlightInfo()                ← AeroDataBox: current flight status
    → getDepartureDelayMinutes()       ← extract delay
    → hasFlightDeparted()              ← check if departed
    → isFlightTerminal()               ← check if terminal state

    CASE: Cancelled          → store.markExpired()
    CASE: departed + delay ≥ threshold
        → PayoutEngine.sendPayout()    ← ERC-20 transfer on Tempo
        → store.markPaidOut(txHash)
    CASE: terminal + delay < threshold → store.markExpired()
    CASE: in-progress        → store.recordCheck() (keep active, retry next cycle)
```

---

## Key Abstractions

### `AppConfig` (`src/types.ts`)
Central config object loaded from environment at startup. Passed by reference to all modules. Single source of truth for network params, insurance parameters, and API keys. Immutable after boot.

### `PolicyStore` (`src/store.ts`)
Singleton `Map`-based in-memory store. Provides typed mutation methods (`create`, `markPaidOut`, `markExpired`, `recordCheck`, `update`). **Not persisted** — restarts clear all policies.

### `PayoutEngine` (`src/payout.ts`)
Stateless payout executor. Creates fresh viem clients per call. Checks pool balance before transfer. Returns `PayoutResult` with `txHash` on success or `error` string on failure. Failed payouts keep policy `active` for retry next cycle.

### `FlightChecker` (`src/checker.ts`)
Cron-style class. Runs immediately on `start()`, then on interval. Processes policies **sequentially** (not in parallel) to avoid hammering AeroDataBox rate limits. `stop()` clears the interval for graceful shutdown.

### `buildServer()` (`src/server.ts`)
Factory function returning a `Hono` instance. Takes `AppConfig`, creates `PayoutEngine` and `Mppx` internally. Clean separation — `index.ts` owns the Node HTTP server, `server.ts` owns the Hono app logic.

---

## Error Handling

| Layer | Strategy |
|---|---|
| `server.ts` | Try/catch around flight fetch and JSON parse; typed HTTP error responses |
| `checker.ts` | Per-policy try/catch; one failed policy doesn't stop the cycle |
| `payout.ts` | Returns `PayoutResult` — never throws to caller; failed payouts retry next cycle |
| `flight.ts` | 404 → null; non-200 → throw with status + body message |
| `index.ts` | Missing required env vars → `process.exit(1)` at boot |

---

## Entry Points

| Entry | Purpose |
|---|---|
| `index.ts` | Main process — loads config, starts HTTP server + checker |
| `npm run dev` | `tsx watch index.ts` — hot reload dev server |
| `npm start` | `tsx index.ts` — production single run |
| `npm run build` | `tsc` — compiles to `dist/`, entry becomes `dist/index.js` |

---

## Graceful Shutdown

`SIGTERM` and `SIGINT` handlers in `index.ts` call `checker.stop()` before `process.exit(0)`, clearing the polling interval cleanly.
