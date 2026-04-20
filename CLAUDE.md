# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FlightGuard MPP is a parametric flight delay insurance app on the Tempo blockchain. Users pay a 1 pathUSD premium via the Machine Payments Protocol (MPP), and if their flight departs with a delay ≥ 60 minutes, 5 pathUSD is automatically sent to their wallet. No claims process — data triggers payment.

## Commands

```bash
npm run dev              # Start Next.js dev server
npm run build            # Build Next.js app
npm start                # Start Next.js production server
npm run checker          # Start background flight checker worker (tsx index.ts)
npm run typecheck        # Type-check without emitting (tsc --noEmit)
npm test                 # Run unit tests (vitest)
npm run test:watch       # Watch mode tests
npm run test:contracts   # Run Hardhat Solidity tests
npm run compile          # Compile Solidity contracts (hardhat compile)
npm run deploy:testnet   # Deploy FlightGuard.sol to Tempo testnet
npm run deploy:mainnet   # Deploy FlightGuard.sol to Tempo mainnet
npm run faucet           # Fund pool wallet with testnet pathUSD (requires Foundry)
```

Run a single test file: `npx vitest run test/store.test.ts`
Run a single test by name: `npx vitest run -t "creates a policy"`

## Architecture

**Primary web app:** Next.js App Router (`app/`) with API routes under `app/api/*`.

**Two runtime processes run concurrently:**

1. **API Routes** (`app/api/*`) — Next.js route handlers:
   - `POST /api/insure` — MPP-gated (mppx/server); charges premium, validates input, calls AeroDataBox, creates policy
   - `GET /api/policy/:id` — free lookup
   - `GET /api/health` — pool balance + policy stats
   - Includes IP rate limiting (10 req/60s) and 1KB body limit

2. **Flight Checker Worker** (`index.ts` + `src/checker.ts`) — `setInterval` loop (default 5min) that:
   - Runs `Promise.allSettled` across all active policies in parallel
   - Triggers payout if departed + delay ≥ threshold
   - Pre-locks policy status to `paid_out` before sending tx to prevent double-payout; rolls back to `active` on failure
   - Expires policies for terminal flights below threshold or cancellations
   - Cleans up terminal policies older than 7 days

**Supporting modules:**

- `src/store.ts` — In-memory `Map<string, Policy>` with JSON file persistence (`policies.json`). Singleton export `store`. Every mutation calls `saveToDisk()` synchronously.
- `src/flight.ts` — AeroDataBox API wrapper with 4-minute in-memory response cache. Key helpers: `getDepartureDelayMinutes`, `hasFlightDeparted`, `isFlightTerminal`.
- `src/payout.ts` — `PayoutEngine` class using viem to send ERC-20 (pathUSD, 6 decimals) transfers on Tempo. Checks pool balance before sending, waits for receipt confirmation.
- `src/alchemy.ts` — Optional MPP *client* (mppx/client) for calling Alchemy Prices/Portfolio APIs. FlightGuard is both an MPP server (receives premiums) and MPP client (pays Alchemy per-call). Returns `null` when `ALCHEMY_SERVICE_URL` is not set; all callers handle null gracefully.
- `src/types.ts` — All shared types, interfaces, and constants. `AppConfig` is the central config shape. Tempo chain constants and Alchemy URL builders live here.

## Key Patterns

- **MPP dual role:** The server uses `mppx/server` to accept premium payments and `mppx/client` to pay Alchemy. The `polyfill: false` option in the Alchemy client prevents intercepting `globalThis.fetch` (needed for AeroDataBox calls).
- **Double-payout prevention:** `checker.ts` sets status to `paid_out` *before* the blockchain tx, then rolls back to `active` if the tx fails. This prevents concurrent checker cycles from paying the same policy twice.
- **pathUSD uses 6 decimals** (like USDC). The constant `PATHUSD_DECIMALS` in `types.ts` is used by `parseUnits`/`formatUnits` calls in payout.ts.
- **Tempo chain definitions** are built at runtime via viem's `defineChain` in `payout.ts`, using config-provided RPC URL and chain ID. Testnet = 42431, Mainnet = 4217.
- **Web UI** is rendered by Next.js pages (`app/`) with static assets in `public/`.

## Testing

Unit tests use **vitest** (config in `vitest.config.ts`). Tests are in `test/*.test.ts`. The config explicitly excludes `test/testnet.test.ts` (live network integration test).

Test files:
- `test/flight.test.ts` — Pure function tests for delay helpers and status classifiers
- `test/store.test.ts` — PolicyStore CRUD, cleanup, and counting

Contract tests use **Hardhat** with `@nomicfoundation/hardhat-toolbox` (Chai assertions). Run separately via `npm run test:contracts`.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on push/PR to main:
- Node 20, `npm ci`, installs Foundry
- Generates an ephemeral pool wallet via `cast wallet new` + funds via Tempo testnet faucet if secrets aren't configured
- Runs `typecheck` then `test`

## Environment

Required env vars: `POOL_PRIVATE_KEY`, `POOL_ADDRESS`, `RAPIDAPI_KEY`. See `.env.example` for all 12+ vars with descriptions. `POOL_ADDRESS` must match the public address derived from `POOL_PRIVATE_KEY`.

When `ALCHEMY_API_KEY` is set, the Alchemy enterprise RPC is used instead of the public Tempo RPC, and WebSocket transport is enabled for lower-latency tx monitoring.
