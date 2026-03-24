# Directory Structure

*Last updated: 2026-03-23*

## Root Layout

```
flightguard-mpp/
├── index.ts                  ← Entry point (config load, server + checker boot, graceful shutdown)
├── package.json              ← Scripts and dependencies
├── tsconfig.json             ← TypeScript config (strict, ES2022, ESNext modules, bundler)
├── hardhat.config.js         ← Hardhat: Solidity compiler + network configs
├── vitest.config.ts          ← Unit test config (TypeScript test files only)
├── .env.example              ← Environment variable template (12 vars)
├── .gitignore                ← node_modules, .env, policies.json
│
├── src/                      ← Application source (TypeScript)
│   ├── server.ts             ← Hono HTTP server (routes, MPP gating, rate limiter, validation)
│   ├── checker.ts            ← Flight polling loop (parallel checks, TTL cleanup)
│   ├── flight.ts             ← AeroDataBox API wrapper + normalizer (4-min cache)
│   ├── payout.ts             ← Tempo/viem payout engine
│   ├── store.ts              ← Policy store (Map + JSON file persistence, cleanup)
│   └── types.ts              ← Shared types, interfaces, constants
│
├── test/                     ← Unit tests (vitest + TypeScript)
│   ├── flight.test.ts        ← getDepartureDelayMinutes, hasFlightDeparted, isFlightTerminal
│   ├── store.test.ts         ← PolicyStore create/update/cleanup lifecycle
│   └── FlightGuard.test.js   ← Hardhat/Mocha contract tests (Solidity)
│
├── contracts/                ← Solidity smart contracts
│   ├── FlightGuard.sol       ← Main contract (policy registry + USDC pool)
│   └── MockERC20.sol         ← ERC-20 mock for Hardhat tests
│
├── scripts/                  ← Utility scripts
│   ├── deploy.js             ← Deploy FlightGuard to testnet/mainnet
│   └── faucet.js             ← Fund pool with testnet pathUSD (Foundry cast)
│
├── memory-bank/              ← Development notes (Roo/Cursor memory bank)
├── dist/                     ← TypeScript compiled output (gitignored)
└── .planning/                ← GSD planning artifacts
    └── codebase/             ← Codebase map documents (this folder)
```

---

## Source File Responsibilities

| File | Responsibility | Key exports |
|---|---|---|
| `index.ts` | Bootstrap: load config, start server + checker, shutdown handlers | — |
| `src/server.ts` | HTTP routes, MPP gating, rate limiting, request validation | `buildServer(config)` |
| `src/checker.ts` | Periodic parallel flight checks, payout triggers, TTL cleanup | `FlightChecker` class |
| `src/flight.ts` | AeroDataBox API client, response normalization, 4-min cache | `fetchFlightInfo()`, `getDepartureDelayMinutes()`, `hasFlightDeparted()`, `isFlightTerminal()`, `getScheduledDepartureUtc()` |
| `src/payout.ts` | Tempo ERC-20 transfer, balance checks | `PayoutEngine` class, `buildPayoutMemo()`, `buildTempoChain()` |
| `src/store.ts` | Policy CRUD, JSON persistence, TTL cleanup | `PolicyStore` class, `store` singleton |
| `src/types.ts` | All shared interfaces, types, constants | `AppConfig`, `Policy`, `FlightInfo`, `PolicyStatus`, `FlightStatus`, `PATHUSD_DECIMALS`, `AERODATABOX_BASE_URL`, `TEMPO_TESTNET`, `TEMPO_MAINNET` |

---

## Test File Responsibilities

| File | Framework | What it tests |
|---|---|---|
| `test/flight.test.ts` | vitest | Pure functions: `getDepartureDelayMinutes`, `hasFlightDeparted`, `isFlightTerminal` — 14 tests |
| `test/store.test.ts` | vitest | `PolicyStore` lifecycle: create, markPaidOut, markExpired, getActive, countByStatus, cleanup — 14 tests |
| `test/FlightGuard.test.js` | Hardhat/Mocha | Solidity contract: `fund()`, `registerPolicy()`, `triggerPayout()`, `expirePolicy()`, `withdraw()` |

---

## Naming Conventions

- **Files**: camelCase single-word (`server.ts`, `checker.ts`, `payout.ts`)
- **Classes**: PascalCase (`FlightChecker`, `PayoutEngine`, `PolicyStore`)
- **Interfaces**: PascalCase (`AppConfig`, `Policy`, `FlightInfo`, `PayoutRequest`)
- **Type unions**: PascalCase (`PolicyStatus`, `FlightStatus`)
- **Constants**: SCREAMING_SNAKE_CASE (`PATHUSD_DECIMALS`, `AERODATABOX_BASE_URL`, `TEMPO_TESTNET`)
- **Functions**: camelCase, verb-first (`fetchFlightInfo`, `buildServer`, `buildPayoutMemo`, `buildTempoChain`)
- **Log prefixes**: `[MODULE]` uppercase bracket prefix (`[SERVER]`, `[CHECKER]`, `[PAYOUT]`, `[FLIGHT]`, `[STORE]`)

---

## Where to Add New Code

| Task | Location |
|---|---|
| New HTTP route | `src/server.ts` — add `app.get/post()` inside `buildServer()` |
| New flight data field | `src/types.ts` (add to `FlightInfo`), `src/flight.ts` (add to `normalizeFlightInfo()`) |
| New payout method | `src/payout.ts` — extend `PayoutEngine` class |
| New policy state | `src/types.ts` (`PolicyStatus` union), `src/store.ts` (new mutation method) |
| New config variable | `src/types.ts` (`AppConfig` interface), `index.ts` (`loadConfig()`), `.env.example` |
| New smart contract | `contracts/` + test in `test/` + update `scripts/deploy.js` |
| New unit test | `test/*.test.ts` — instantiate `PolicyStore` with temp path for isolation |
