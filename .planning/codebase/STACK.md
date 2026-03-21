# Technology Stack

**Analysis Date:** 2026-03-21

## Languages

**Primary:**
- TypeScript 5.0+ - All application code, strict mode enabled

**Runtime:**
- Node.js - Server runtime via tsx

## Runtime & Build

**Environment:**
- Node.js (version specified in package.json dependencies)
- tsx 4.0+ - TypeScript execution and watching

**Package Manager:**
- npm - Lockfile: `package-lock.json` (present)

## Frameworks & Core Libraries

**HTTP Server:**
- Hono 4.0+ - Lightweight web framework for REST API
  - Location: `src/server.ts`
  - Used for: Route handlers (POST /insure, GET /policy/:id, GET /health, GET /policies)

**Web Server Transport:**
- @hono/node-server 1.0+ - Node.js adapter for Hono
  - Entry point: `index.ts` uses `serve()` from this package

**Web3 / Blockchain:**
- viem 2.0+ - Ethereum/EVM client library for contract interaction
  - Location: `src/payout.ts`
  - Used for: Creating wallet and public clients, reading/writing ERC-20 contracts
  - Features used:
    - `createWalletClient`, `createPublicClient`
    - `privateKeyToAccount` - Pool wallet signing
    - `parseUnits`, `formatUnits` - Token decimal handling
    - `defineChain` - Custom chain (Tempo) definition
    - Contract reading (balanceOf) and writing (transfer)

**Micropayment Protocol:**
- mppx 0.4.5 - MPP (Micropayment Protocol) implementation
  - Location: `src/server.ts`
  - Used for: Gating POST /insure endpoint with pathUSD payment
  - Method: Tempo payment method with pathUSD currency

## Configuration & Environment

**Environment Loading:**
- dotenv 16.0+ - Load `.env` file at startup
  - Entry point: `index.ts` - imported as 'dotenv/config'

**Configuration Pattern:**
- Loaded once at startup via `loadConfig()` in `index.ts`
- Required env vars:
  - `POOL_PRIVATE_KEY` - Pool wallet private key (hex format)
  - `POOL_ADDRESS` - Pool wallet address (0x format)
  - `RAPIDAPI_KEY` - AeroDataBox API authentication

**Optional env vars with defaults:**
- `TEMPO_RPC_URL` - Default: `https://rpc.moderato.tempo.xyz` (testnet)
- `CHAIN_ID` - Default: `42431` (Tempo testnet)
- `PATHUSD_ADDRESS` - Default: `0x20c0000000000000000000000000000000000000` (testnet)
- `PORT` - Default: `3000`
- `PREMIUM_AMOUNT` - Default: `"1.00"` pathUSD
- `PAYOUT_MULTIPLIER` - Default: `5`
- `DELAY_THRESHOLD_MIN` - Default: `60` minutes
- `CHECK_INTERVAL_MS` - Default: `300000` (5 minutes)

## Data & Storage

**In-Memory Store:**
- Custom PolicyStore class in `src/store.ts`
- Stores policies in `Map<string, Policy>`
- No persistence - data lost on restart
- Used for: Flight insurance policy tracking and status

**External Data:**
- HTTP fetch (Node.js built-in) - AeroDataBox flight data API

## Build & Compilation

**TypeScript Compiler:**
- tsc - Configured in `tsconfig.json`
- Target: ES2022
- Module: ESNext
- Output directory: `./dist`

**Build Scripts (package.json):**
- `dev` - `tsx watch index.ts` - Development with auto-reload
- `start` - `tsx index.ts` - Run once
- `build` - `tsc` - Compile to JavaScript
- `typecheck` - `tsc --noEmit` - Type checking without output

## Key Dependencies

**Critical for Function:**
- mppx 0.4.5 - Enables micropayment-gated insurance API (core business logic)
- viem 2.0+ - Enables payout transactions on Tempo blockchain
- Hono 4.0+ - HTTP server framework (required for API)

**Infrastructure:**
- node-fetch 3.0+ - Fetch API for Node.js (flight data requests)
- @types/node 20.0+ - TypeScript definitions for Node.js APIs

## Platform Requirements

**Development:**
- Node.js 18+ (implied by viem/TypeScript 5.0 compatibility)
- npm for dependency management
- Tempo RPC endpoint access (testnet: moderato, mainnet: standard)

**Production:**
- Tempo blockchain node (RPC endpoint)
- AeroDataBox API key via RapidAPI
- pathUSD token contract on target Tempo network
- Pool wallet with private key for signing payouts

**Network Access:**
- Outbound HTTPS to aerodatabox.p.rapidapi.com (flight data)
- Outbound HTTPS to Tempo RPC endpoint (blockchain reads/writes)
- Inbound HTTP on configured PORT (default 3000) for API

---

*Stack analysis: 2026-03-21*
