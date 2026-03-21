# Flight Delay Parametric Insurance — Multi-Agent Build Spec

## Project Identity
**Name:** FlightGuard MPP  
**Author:** Delos Labs  
**Description:** A parametric flight delay insurance dApp built on Tempo using MPP micropayments. Users pay a premium in pathUSD to insure a specific flight. If the flight is delayed by more than 60 minutes, the policy automatically pays out a pre-defined amount to the user's wallet. No claims process, no adjusters — just code and oracles.
**Chain:** Tempo Testnet (Moderato)  
**Purpose:** Parametric flight delay insurance using MPP micropayments on Tempo. No claims. No adjusters. Pay premium → flight monitored → auto payout if delayed >60min.

---

## Agent Roster

| Agent File | Responsibility | Must Run After |
|---|---|---|
| `AGENT_1_SETUP.md` | Scaffold project, install deps, env config | — |
| `AGENT_2_TYPES.md` | All TypeScript types, interfaces, constants | Agent 1 |
| `AGENT_3_FLIGHT.md` | AeroDataBox API wrapper (`flight.ts`) | Agent 2 |
| `AGENT_4_PAYOUT.md` | Tempo USDC transfer logic (`payout.ts`) | Agent 2 |
| `AGENT_5_STORE.md` | In-memory policy store (`store.ts`) | Agent 2 |
| `AGENT_6_SERVER.md` | Hono HTTP server with MPP gates (`server.ts`) | Agents 3,4,5 |
| `AGENT_7_CHECKER.md` | Cron job: check flights, trigger payouts (`checker.ts`) | Agents 3,4,5 |
| `AGENT_8_ENTRYPOINT.md` | Entry point + README + demo script | Agents 6,7 |

---

## Shared Context (ALL AGENTS MUST READ THIS)

### Network — Tempo Testnet (Moderato)
```
Chain ID:    42431
RPC HTTP:    https://rpc.moderato.tempo.xyz
RPC WS:      wss://rpc.moderato.tempo.xyz
Explorer:    https://explore.testnet.tempo.xyz
Faucet:      https://docs.tempo.xyz/quickstart/faucet
```

### Network — Tempo Mainnet
```
Chain ID:    4217
RPC HTTP:    https://rpc.tempo.xyz
RPC WS:      wss://rpc.tempo.xyz
Explorer:    https://explore.tempo.xyz
```

### Key Contract Addresses (same on both networks unless noted)
```
pathUSD (stablecoin):  0x20c0000000000000000000000000000000000000
TIP-20 Factory:        0x20fc000000000000000000000000000000000000
Fee Manager:           0xfeec000000000000000000000000000000000000
```
> **For hackathon:** use pathUSD as the insurance currency on testnet.

### MPP Library — mppx@0.4.5
```ts
// Server pattern (EXACT — do not deviate):
import { Mppx, tempo } from 'mppx/server'

const mppx = Mppx.create({
  methods: [
    tempo({
      currency: '0x20c0000000000000000000000000000000000000', // pathUSD
      recipient: process.env.POOL_ADDRESS!,
    }),
  ],
})

// Gate a route:
const r = await mppx.charge({ amount: '1.00' })(request)
if (r.status === 402) return r.challenge
return r.withReceipt(Response.json({ ... }))
```

### Viem — Tempo chain definition
```ts
import { defineChain } from 'viem'

export const tempoTestnet = defineChain({
  id: 42431,
  name: 'Tempo Testnet',
  nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.moderato.tempo.xyz'] },
  },
})
```

### AeroDataBox API
- Base URL: `https://aerodatabox.p.rapidapi.com`
- Endpoint: `GET /flights/number/{flightNumber}/{date}`
- Date format: `YYYY-MM-DD`
- Header: `X-RapidAPI-Key: {RAPIDAPI_KEY}`
- Header: `X-RapidAPI-Host: aerodatabox.p.rapidapi.com`
- Delay field: `departure.delays[0].minutes` (may be absent if no delay)
- Status field: `status` → values include `"Departed"`, `"Scheduled"`, `"Cancelled"`

### Environment Variables (.env)
```
# Tempo
POOL_PRIVATE_KEY=        # Pool wallet private key (insurer)
POOL_ADDRESS=            # Pool wallet address (derived from above)
TEMPO_RPC_URL=https://rpc.moderato.tempo.xyz
CHAIN_ID=42431
PATHUSD_ADDRESS=0x20c0000000000000000000000000000000000000

# Flight Data
RAPIDAPI_KEY=            # RapidAPI key for AeroDataBox

# Server
PORT=3000
PREMIUM_AMOUNT=1.00      # USDC premium per policy
PAYOUT_MULTIPLIER=5      # Payout = premium * multiplier
DELAY_THRESHOLD_MIN=60   # Minutes delay to trigger payout
CHECK_INTERVAL_MS=300000 # 5 minutes
```

### File Structure
```
src/
  types.ts        ← Agent 2
  flight.ts       ← Agent 3
  payout.ts       ← Agent 4
  store.ts        ← Agent 5
  server.ts       ← Agent 6
  checker.ts      ← Agent 7
index.ts          ← Agent 8
package.json      ← Agent 1
tsconfig.json     ← Agent 1
.env.example      ← Agent 1
README.md         ← Agent 8
```

---

## Critical Rules for All Agents

1. **No database** — in-memory Map only. Demo context.
2. **No try/catch swallowing** — always log errors with context.
3. **console.log everything** — judges watch the terminal.
4. **Use pathUSD** (`0x20c0000000000000000000000000000000000000`) as currency.
5. **Use viem** (not ethers) for Tempo interactions — it has native Tempo chain support.
6. **Use Hono** for HTTP server — it has first-class mppx middleware support.
7. **TypeScript strict mode** — `"strict": true` in tsconfig.
8. **Never hardcode private keys** — always from `process.env`.
9. **Export everything** — all functions/types exported for cross-file use.
10. **One file per agent's scope** — do not create files outside your assigned scope.

---

## Project Status

**Project:** FlightGuard MPP  
**Parametric flight delay insurance on Tempo via MPP**  

**GSD State:** NOT INITIALIZED  
**Planning:** No .planning/ directory found  

**Code status:** Implemented (last commit: Tempo payout engine)
