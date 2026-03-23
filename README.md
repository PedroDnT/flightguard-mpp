# FlightGuard MPP

**Parametric flight delay insurance on [Tempo](https://tempo.xyz) using the [Machine Payments Protocol](https://mpp.dev).**

Built by [OCTO INTELIGÊNCIA DE DADOS LTDA](https://github.com/PedroDnT) for the Tempo MPP Hackathon.

---

## What Is This?

FlightGuard eliminates the traditional insurance claims process entirely.

1. **Pay premium** via MPP (one stablecoin micropayment, ~$1)
2. **Flight is monitored** automatically every 5 minutes via AeroDataBox
3. **Payout fires automatically** if departure delay exceeds 60 minutes — no claim required

No paperwork. No adjusters. No waiting. Pure parametric: data → condition → payment.

---

## How It Works

```
Agent/User                    FlightGuard Server              Tempo Blockchain
     |                               |                               |
     |-- POST /insure (MPP) -------->|                               |
     |   pays 1 pathUSD premium      |-- verify payment ------------>|
     |                               |<- payment confirmed ----------|
     |                               |-- fetch flight via AeroDataBox|
     |<-- { policyId, payoutAmt } ---|                               |
     |                               |                               |
     |                    [every 5 min: check flight]                |
     |                               |-- GET flight status           |
     |                               |   delay > 60min? YES          |
     |                               |-- transfer(payoutAddr, 5 USD) |
     |                               |                               |
     |<-- 5 pathUSD arrives -------->|                               |
```

---

## Setup

### 1. Prerequisites
- Node.js >= 18
- RapidAPI account (free) → [AeroDataBox API](https://rapidapi.com/aedbx-aedbx/api/aerodatabox)
- Tempo testnet wallet with pathUSD → [Faucet](https://docs.tempo.xyz/quickstart/faucet)

### 2. Install
```bash
npm install
```

### 3. Configure
```bash
cp .env.example .env
# Fill in POOL_PRIVATE_KEY, POOL_ADDRESS, RAPIDAPI_KEY
```

### 4. Fund the pool
```bash
npm run faucet          # funds POOL_ADDRESS from .env with 1M pathUSD (testnet only)
```
Requires [Foundry](https://getfoundry.sh). Or fund a specific address:
```bash
npm run faucet -- 0xYourAddress
```

### 5. Start
```bash
npm start
```

---

## Demo Script

### Step 1 — Check pool is funded
```bash
curl http://localhost:3000/health
```

### Step 2 — Buy a policy (using mppx CLI)
```bash
# Install mppx CLI globally
npm i -g mppx

# Create a funded testnet account
mppx account create

# Buy insurance for a real flight
mppx http://localhost:3000/insure \
  --method POST \
  --data '{"flightNumber":"LA3251","date":"2026-03-19","payoutAddress":"0xYourWalletHere"}'
```

### Step 3 — Check your policy
```bash
curl http://localhost:3000/policy/{policyId}
```

### Step 4 — Watch the checker
Watch the terminal — every 5 minutes you'll see:
```
[CHECKER] Checking 1 active policy(ies)
[CHECKER] Checking policy abc-123...
[CHECKER]   Flight: LA3251 on 2026-03-19
[CHECKER]   Status:  Departed
[CHECKER]   Delay:   75 minutes
[CHECKER]   → Delay 75min ≥ threshold 60min — TRIGGERING PAYOUT
[PAYOUT] ✅ CONFIRMED in block 1234567
```

### Step 5 — Verify payout on explorer
`https://explore.testnet.tempo.xyz/tx/{txHash}`

---

## Underwriting Note

In this demo, the **pool wallet acts as the sole insurer**. The pool must be pre-funded with enough pathUSD to cover potential payouts. For production, underwriting could be:
- A DAO liquidity pool (stakers earn premium yield)
- A reinsurance API integration
- Overcollateralized stablecoin vault

---

## Architecture

```
index.ts          — Boot: loads config, starts server + checker
src/types.ts      — All TypeScript types and constants
src/flight.ts     — AeroDataBox API wrapper
src/payout.ts     — Tempo pathUSD transfer engine (viem)
src/store.ts      — In-memory policy store
src/server.ts     — Hono HTTP server with MPP-gated routes
src/checker.ts    — Cron: polls flights, triggers payouts
```

---

## Network

| Property | Testnet | Mainnet |
|---|---|---|
| Chain ID | 42431 | 4217 |
| RPC | rpc.moderato.tempo.xyz | rpc.tempo.xyz |
| Explorer | explore.testnet.tempo.xyz | explore.tempo.xyz |
| pathUSD | `0x20c000...` | `0x20c000...` |

---

## License
MIT — OCTO INTELIGÊNCIA DE DADOS LTDA
