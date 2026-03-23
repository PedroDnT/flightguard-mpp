# Developer Instructions

Practical setup and workflow guide for FlightGuard MPP.

---

## Prerequisites

- **Node.js** >= 18
- **RapidAPI key** — AeroDataBox API ([sign up](https://rapidapi.com/aedbx-aedbx/api/aerodatabox))
- **Tempo wallet** with private key + pool pre-funded with pathUSD

---

## Installation

```bash
npm install
```

---

## Environment Setup

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
```

| Variable | Description | Default |
|---|---|---|
| `POOL_PRIVATE_KEY` | Private key of the pool/insurer wallet | required |
| `POOL_ADDRESS` | Pool wallet address | required |
| `TEMPO_RPC_URL` | Tempo network RPC endpoint | `https://rpc.moderato.tempo.xyz` (testnet) |
| `CHAIN_ID` | Network chain ID | `42431` (testnet) |
| `PATHUSD_ADDRESS` | pathUSD stablecoin contract address | `0x20c000...` (testnet) |
| `RAPIDAPI_KEY` | AeroDataBox API key from RapidAPI | required |
| `PORT` | HTTP server port | `3000` |
| `PREMIUM_AMOUNT` | Premium in USD | `1.00` |
| `PAYOUT_MULTIPLIER` | Payout = premium × multiplier | `5` |
| `DELAY_THRESHOLD_MIN` | Minutes of delay to trigger payout | `60` |
| `CHECK_INTERVAL_MS` | Polling interval in ms | `300000` (5 min) |

---

## Running Locally

**Development** (hot reload via tsx watch):
```bash
npm run dev
```

**Production** (single run):
```bash
npm start
```

Server starts on `http://localhost:3000` (or `PORT` from `.env`).

---

## Scripts Reference

| Script | Command | Purpose |
|---|---|---|
| `dev` | `tsx watch index.ts` | Dev server with hot reload |
| `start` | `tsx index.ts` | Run server once |
| `build` | `tsc` | Compile TypeScript to `dist/` |
| `typecheck` | `tsc --noEmit` | Type-check without emitting |
| `compile` | `hardhat compile` | Compile Solidity contracts |
| `test:contracts` | `hardhat test` | Run Hardhat contract tests |
| `deploy:testnet` | `hardhat run scripts/deploy.js --network tempo-testnet` | Deploy to Tempo testnet |
| `deploy:mainnet` | `hardhat run scripts/deploy.js --network tempo` | Deploy to Tempo mainnet |

---

## API Usage

### Buy a policy (via mppx CLI)
```bash
mppx POST http://localhost:3000/buy-policy \
  --data '{"flightNumber":"AA123","departureDate":"2024-12-25"}'
```

### Buy a policy (via curl with manual payment)
```bash
curl -X POST http://localhost:3000/buy-policy \
  -H "Content-Type: application/json" \
  -d '{"flightNumber":"AA123","departureDate":"2024-12-25"}'
```

---

## Testing

```bash
# Run Hardhat smart contract tests
npm run test:contracts

# Type-check without running
npm run typecheck
```

---

## Build

```bash
npm run build
# Output: dist/
```

---

## Contract Deployment

### Networks

| Network | Chain ID | RPC | Explorer |
|---|---|---|---|
| Testnet | 42431 | `https://rpc.moderato.tempo.xyz` | Tempo testnet explorer |
| Mainnet | (see hardhat.config) | Tempo mainnet RPC | Tempo mainnet explorer |

```bash
# Deploy to testnet
npm run deploy:testnet

# Deploy to mainnet
npm run deploy:mainnet
```

---

## Important Gotchas

1. **In-memory store** — Active policies are stored in memory (`Map`). Restarting the server loses all active policies. There is no database persistence.

2. **Pool must be pre-funded** — The pool wallet (`POOL_ADDRESS`) must hold enough pathUSD to cover potential payouts before accepting policies. Fund it before running.

3. **5-minute polling** — The flight checker polls every 5 minutes (`CHECK_INTERVAL_MS=300000`). Delays are not detected in real time.

4. **Private key security** — `POOL_PRIVATE_KEY` is a hot wallet key used to sign payout transactions. Never commit `.env` or expose this key.

5. **AeroDataBox rate limits** — The free RapidAPI tier has rate limits. Under heavy load, flight status checks may fail silently. Monitor RapidAPI dashboard for quota usage.
