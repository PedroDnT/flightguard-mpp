# Directory Structure

## Root Layout

```
flightguard-mpp/
├── index.ts                  ← Entry point (config load, server + checker boot)
├── package.json              ← Scripts and dependencies
├── tsconfig.json             ← TypeScript config (strict, ES2022, ESNext modules, bundler)
├── hardhat.config.js         ← Hardhat: Solidity compiler + network configs
├── .env.example              ← Environment variable template (11 vars)
│
├── src/                      ← Application source (TypeScript)
│   ├── server.ts             ← Hono HTTP server (routes + MPP gating)
│   ├── checker.ts            ← Flight polling loop (setInterval cron)
│   ├── flight.ts             ← AeroDataBox API wrapper + normalizer
│   ├── payout.ts             ← Tempo/viem payout engine
│   ├── store.ts              ← In-memory policy store (singleton)
│   └── types.ts              ← Shared types, interfaces, constants
│
├── contracts/                ← Solidity smart contracts
│   ├── FlightGuard.sol       ← Main contract (policy registry + USDC pool)
│   └── MockERC20.sol         ← ERC-20 mock for Hardhat tests
│
├── test/                     ← Hardhat contract tests (JavaScript/Chai)
│   └── FlightGuard.test.js   ← Full contract test suite
│
├── scripts/                  ← Deployment scripts
│   └── deploy.js             ← Deploy FlightGuard to testnet/mainnet
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
| `src/server.ts` | HTTP routes, MPP gating, request validation | `buildServer(config)` |
| `src/checker.ts` | Periodic flight checks, payout triggers | `FlightChecker` class |
| `src/flight.ts` | AeroDataBox API client, response normalization | `fetchFlightInfo()`, `getDepartureDelayMinutes()`, `hasFlightDeparted()`, `isFlightTerminal()`, `getScheduledDepartureUtc()` |
| `src/payout.ts` | Tempo ERC-20 transfer, balance checks | `PayoutEngine` class, `buildPayoutMemo()`, `buildTempoChain()` |
| `src/store.ts` | In-memory `Map`-based policy store | `store` singleton (`PolicyStore`) |
| `src/types.ts` | All shared interfaces, types, constants | `AppConfig`, `Policy`, `FlightInfo`, `PolicyStatus`, `FlightStatus`, `PATHUSD_DECIMALS`, `AERODATABOX_BASE_URL`, `TEMPO_TESTNET`, `TEMPO_MAINNET` |

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
