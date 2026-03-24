# Technology Stack

*Last updated: 2026-03-23*

## Language & Runtime

| Layer | Technology |
|---|---|
| Language | TypeScript 5.x (strict mode) |
| Runtime | Node.js >= 18 (ESM modules) |
| Module system | ESNext / `"moduleResolution": "bundler"` |
| Compiler output | `dist/` via `tsc` |
| Dev execution | `tsx watch` (no compile step needed in dev) |

## HTTP Framework

**Hono** (`hono@^4`, `@hono/node-server@^1`)
- Lightweight web framework; Hono app served via `@hono/node-server`
- Entry: `index.ts` → `buildServer()` in `src/server.ts`
- Routes: `POST /insure`, `GET /policy/:id`, `GET /health`
- Middleware: `bodyLimit(1KB)` on `POST /insure`
- Rate limiting: module-level in-memory IP map (10 req/60s, no external dep)

## Micropayment Protocol

**mppx** (`mppx@^0.4.5`)
- `Mppx.create()` + `tempo()` adapter used in `src/server.ts`
- Payment gating via `mppx.charge({ amount })` on `POST /insure`
- Returns HTTP 402 challenge if payment not included; `r.withReceipt()` wraps success response

## Blockchain / Web3

**viem** (`viem@^2`)
- `createWalletClient`, `createPublicClient` for on-chain writes and reads
- `privateKeyToAccount` for pool wallet signing
- `parseUnits` / `formatUnits` for pathUSD (6 decimals) conversion
- `defineChain` for Tempo network definition
- Used exclusively in `src/payout.ts`

## Smart Contracts

**Hardhat** (`hardhat@^2.28.6`) + **Solidity 0.8.19**
- Contract: `contracts/FlightGuard.sol` (ERC-20 pool + policy registry)
- Mock: `contracts/MockERC20.sol` (test fixture)
- Optimizer: enabled, 200 runs
- Test runner: `@nomicfoundation/hardhat-toolbox` (Chai + ethers.js v6)
- Deploy script: `scripts/deploy.js`

## External Data

**AeroDataBox** via RapidAPI
- Base URL: `https://aerodatabox.p.rapidapi.com`
- Auth: `X-RapidAPI-Key` header
- 4-minute in-memory cache (`flightCache`) in `src/flight.ts` — reduces quota usage

## Persistence

**Node.js `fs` module** (no external database)
- `policies.json` — JSON file with `[id, Policy][]` entries
- Loaded synchronously on `PolicyStore` construction
- Written synchronously on every mutation (`create`, `update`, `cleanup`)
- Path configurable via `STORE_PATH` env var (default: `policies.json`)
- Gitignored; survives server restarts

## Testing

**vitest** (`vitest@^4.1.1`)
- Unit tests for `src/flight.ts` and `src/store.ts`
- Config: `vitest.config.ts` (`include: ['test/**/*.test.ts']`)
- 28 tests, ~200ms run time
- `PolicyStore` accepts `storePath` constructor arg for test isolation (no disk I/O)

## Configuration

**dotenv** (`dotenv@^16`) loaded at startup in `index.ts`
- All config centralized in `AppConfig` interface (`src/types.ts`)
- Required vars: `POOL_PRIVATE_KEY`, `POOL_ADDRESS`, `RAPIDAPI_KEY`
- Optional with defaults: `TEMPO_RPC_URL`, `CHAIN_ID`, `PATHUSD_ADDRESS`, `PORT`, `PREMIUM_AMOUNT`, `PAYOUT_MULTIPLIER`, `DELAY_THRESHOLD_MIN`, `CHECK_INTERVAL_MS`, `STORE_PATH`

## Key Files

| File | Role |
|---|---|
| `package.json` | Scripts, dependencies |
| `tsconfig.json` | TypeScript config (strict, ES2022 target, ESNext modules, bundler resolution) |
| `vitest.config.ts` | Unit test config |
| `hardhat.config.js` | Hardhat networks (hardhat local, tempo-testnet, tempo mainnet) |
| `.env.example` | Environment variable template (12 vars documented) |
| `index.ts` | Entry point — config load, server start, checker start, graceful shutdown |
| `policies.json` | Runtime policy store (gitignored, created on first run) |
