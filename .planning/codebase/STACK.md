# Technology Stack

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
- Routes: `POST /insure`, `GET /policy/:id`, `GET /health`, `GET /policies`

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
- Used in `src/flight.ts`

## Configuration

**dotenv** (`dotenv@^16`) loaded at startup in `index.ts`
- All config centralized in `AppConfig` interface (`src/types.ts`)
- Required vars: `POOL_PRIVATE_KEY`, `POOL_ADDRESS`, `RAPIDAPI_KEY`
- Optional with defaults: `TEMPO_RPC_URL`, `CHAIN_ID`, `PATHUSD_ADDRESS`, `PORT`, `PREMIUM_AMOUNT`, `PAYOUT_MULTIPLIER`, `DELAY_THRESHOLD_MIN`, `CHECK_INTERVAL_MS`

## Key Files

| File | Role |
|---|---|
| `package.json` | Scripts, dependencies |
| `tsconfig.json` | TypeScript config (strict, ES2022 target, ESNext modules, bundler resolution) |
| `hardhat.config.js` | Hardhat networks (hardhat local, tempo-testnet, tempo mainnet) |
| `.env.example` | Environment variable template (11 vars documented) |
| `index.ts` | Entry point — config load, server start, checker start, graceful shutdown |
