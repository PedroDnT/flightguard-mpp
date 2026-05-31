# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FlightGuard MPP is a parametric flight delay insurance app on the Tempo blockchain. Users pay a 1 pathUSD premium via the Machine Payments Protocol (MPP), and if their flight departs with a delay ≥ 60 minutes, 5 pathUSD is automatically sent to their wallet. No claims process — data triggers payment.

## Commands

```bash
npm run dev              # Start dev server (tsx watch index.ts)
npm start                # Start production server (tsx index.ts)
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

**Single Hono server process** (`index.ts` → `src/server.ts`) serves the API and static UI from `public/`:

- `POST /insure` — MPP-gated; charges premium, validates input, calls AeroDataBox, creates policy
- `GET /policy/:id` — free status lookup
- `GET /health` — pool balance + policy stats
- `GET /flight-lookup` — AeroDataBox proxy (keeps API key server-side)
- `POST /demo/policy` + `POST /demo/policy/:id/resolve` — simulation endpoints for the demo UI

**Flight checker worker** runs as a `setInterval` loop (default 5 min) in the same process:
- Polls all active policies via AeroDataBox
- Triggers payout if departed + delay ≥ threshold
- Pre-locks status to `paid_out` before blockchain tx to prevent double-payout; rolls back on failure

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
