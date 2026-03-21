# Structure — FlightGuard MPP

## Directory Layout

```
flightguard-mpp/
├── src/                        # Application source code
│   ├── types.ts                # Shared types, interfaces, constants
│   ├── server.ts               # Fastify HTTP server + route definitions
│   ├── store.ts                # In-memory policy store (Map<id, Policy>)
│   ├── flight.ts               # AeroDataBox API client + response parser
│   ├── checker.ts              # Background polling loop for flight delays
│   └── payout.ts               # Tempo blockchain payout execution (viem)
├── index.ts                    # Entry point — wires server + starts checker
├── .env.example                # Environment variable template
├── .envrc                      # direnv config (auto-loads .env)
├── package.json                # Node.js manifest + scripts
├── tsconfig.json               # TypeScript compiler config
├── README.md                   # Project documentation
│
├── .claude/                    # Claude Code agent definitions
│   └── .agents/
│       ├── AGENTS.md           # Master agent coordination doc
│       ├── AGENTS_5_6_7_8.md   # Phase 5-8 agent specs
│       ├── AGENT_1_SETUP.md    # Setup agent spec
│       ├── AGENT_2_TYPES.md    # Types agent spec
│       ├── AGENT_3_FLIGHT.md   # Flight agent spec
│       └── AGENT_4_PAYOUT.md   # Payout agent spec
│
├── .github/                    # GitHub/Copilot chat mode configs
│   ├── architect.chatmode.md
│   ├── ask.chatmode.md
│   ├── code.chatmode.md
│   └── debug.chatmode.md
│
├── memory-bank/                # Roo/Cursor memory bank docs
│   ├── activeContext.md        # Current work context
│   ├── architect.md            # Architecture decisions
│   ├── decisionLog.md          # Decision history
│   ├── productContext.md       # Product goals
│   ├── progress.md             # Implementation progress
│   ├── projectBrief.md         # Project brief
│   └── systemPatterns.md       # System patterns
│
└── .planning/                  # GSD planning artifacts
    └── codebase/               # This codebase map
```

## Key Files

| File | Role |
|------|------|
| `index.ts` | Entry point: loads config, starts Fastify, launches checker loop |
| `src/types.ts` | Single source of truth for all types, interfaces, and constants |
| `src/server.ts` | HTTP API: `POST /insure`, `GET /policy/:id`, `GET /health` |
| `src/store.ts` | PolicyStore class — in-memory Map with CRUD methods |
| `src/flight.ts` | `fetchFlightInfo()` — calls AeroDataBox, normalizes response |
| `src/checker.ts` | `startChecker()` — polling loop, evaluates delays, triggers payouts |
| `src/payout.ts` | `sendPayout()` — viem wallet client, ERC-20 transfer on Tempo chain |
| `.env.example` | Documents all required environment variables |

## Naming Conventions

### Files
- **Lowercase kebab-case** — not used here (all files are single-word camelCase: `server.ts`, `checker.ts`)
- **Single responsibility** — each file maps 1:1 to a domain concept

### Types & Interfaces
- **PascalCase** for interfaces: `Policy`, `FlightInfo`, `AppConfig`, `PayoutRequest`
- **PascalCase** for type aliases: `PolicyStatus`, `FlightStatus`
- Defined centrally in `src/types.ts`, imported where needed

### Functions
- **camelCase**: `fetchFlightInfo`, `startChecker`, `sendPayout`, `loadConfig`
- Verb-first naming pattern: `fetch*`, `start*`, `send*`, `load*`, `get*`

### Variables / Constants
- **camelCase** for variables: `policyStore`, `checkResult`
- **SCREAMING_SNAKE_CASE** for module-level constants: `PATHUSD_DECIMALS`, `AERODATABOX_BASE_URL`, `TEMPO_TESTNET`

### Environment Variables
- **SCREAMING_SNAKE_CASE**: `POOL_PRIVATE_KEY`, `TEMPO_RPC_URL`, `RAPID_API_KEY`
- Documented in `.env.example`

## Configuration Files

| File | Purpose |
|------|---------|
| `tsconfig.json` | TypeScript strict mode, ESNext target, bundler module resolution |
| `package.json` | `type: "module"` (ESM), scripts: `dev` (tsx watch), `build` (tsc) |
| `.env.example` | Template for all required env vars |
| `.envrc` | direnv: auto-sources `.env` when entering directory |

## Module Import Patterns

```typescript
// Types always imported from central types.ts
import type { Policy, AppConfig, FlightInfo } from './types.js'

// Config injected from index.ts → passed as parameter
// No global config singleton — config flows down as function argument

// Store passed by reference through function calls
// (checker, server both receive the same PolicyStore instance)
```

## Entry Point Flow

```
index.ts
  └── loadConfig()           → AppConfig from env vars
  └── new PolicyStore()      → in-memory store
  └── buildServer(config, store)  → Fastify instance with routes
  └── server.listen()        → HTTP server on configured port
  └── startChecker(config, store) → setInterval polling loop
```
