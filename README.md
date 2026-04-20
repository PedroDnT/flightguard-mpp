# FlightGuard MPP

**Parametric flight delay insurance on [Tempo](https://tempo.xyz) using the [Machine Payments Protocol](https://mpp.dev).**

Built by [OCTO INTELIGÊNCIA DE DADOS LTDA](https://github.com/PedroDnT) for the Tempo MPP Hackathon.

[![CI](https://github.com/PedroDnT/flightguard-mpp/actions/workflows/ci.yml/badge.svg)](https://github.com/PedroDnT/flightguard-mpp/actions/workflows/ci.yml)
[![Deploy](https://github.com/PedroDnT/flightguard-mpp/actions/workflows/deploy.yml/badge.svg)](https://github.com/PedroDnT/flightguard-mpp/actions/workflows/deploy.yml)

---

## What is FlightGuard?

FlightGuard eliminates the traditional insurance claims process entirely.

1. **Pay 1 pathUSD** — buy a policy via MPP in one HTTP call
2. **We monitor your flight** — checked every 5 minutes via AeroDataBox
3. **Get paid automatically** — 5 pathUSD lands in your wallet if departure delay ≥ 60 min

No forms. No adjusters. No waiting. Pure parametric: data triggers payment.

---

## Quick Start (Local)

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Fill in POOL_PRIVATE_KEY, POOL_ADDRESS, RAPIDAPI_KEY, ADMIN_PASSWORD

# 3. Fund pool (testnet only)
npm run faucet

# 4. Start (two terminals)
npm run dev        # Next.js app  → http://localhost:3000
npm run checker    # Flight checker worker
```

---

## Deploy to Render (One Click)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/PedroDnT/flightguard-mpp)

Or manually:

1. Fork / push to your GitHub account
2. Go to [render.com](https://render.com) → **New → Blueprint**
3. Connect your repo — Render detects `render.yaml` automatically
4. Set the required environment variables in the Render dashboard (see table below)
5. Click **Apply** — both the web app and checker start in a single service sharing one disk

### Automated Deploy via GitHub Actions

Every push to `main` that passes tests automatically deploys to Render.

**Setup:**

1. In the Render dashboard, go to your service → **Settings → Deploy Hook** → copy the URL
2. In GitHub, go to **Settings → Secrets → Actions** → add `RENDER_DEPLOY_HOOK_URL`

That's it. `git push` → tests pass → Render deploys.

---

## Environment Variables

| Variable              | Required | Default         | Description                                                   |
| --------------------- | -------- | --------------- | ------------------------------------------------------------- |
| `POOL_PRIVATE_KEY`    | ✅       | —               | Private key of pool wallet (signs payouts)                    |
| `POOL_ADDRESS`        | ✅       | —               | Public address of pool wallet (receives premiums)             |
| `RAPIDAPI_KEY`        | ✅       | —               | AeroDataBox API key via RapidAPI                              |
| `ADMIN_PASSWORD`      | ✅       | —               | Admin panel login password                                    |
| `CHAIN_ID`            | —        | `42431`         | `42431` = testnet · `4217` = mainnet                          |
| `TEMPO_RPC_URL`       | —        | testnet RPC     | Tempo network RPC endpoint                                    |
| `PATHUSD_ADDRESS`     | —        | `0x20c0…`       | pathUSD ERC-20 token address                                  |
| `PORT`                | —        | `3000`          | HTTP server port                                              |
| `PREMIUM_AMOUNT`      | —        | `1.00`          | Policy premium in pathUSD                                     |
| `PAYOUT_MULTIPLIER`   | —        | `5`             | Payout = premium × multiplier                                 |
| `DELAY_THRESHOLD_MIN` | —        | `60`            | Minutes of delay to trigger payout                            |
| `CHECK_INTERVAL_MS`   | —        | `300000`        | Checker poll interval (ms)                                    |
| `STORE_PATH`          | —        | `policies.json` | Path for policy persistence file                              |
| `AUDIT_PATH`          | —        | `audit.json`    | Path for audit log file                                       |
| `ALCHEMY_SERVICE_URL` | —        | —               | Optional Alchemy MPP service URL                              |
| `ALCHEMY_API_KEY`     | —        | —               | Optional Alchemy API key (enables enterprise RPC + WebSocket) |

> `POOL_ADDRESS` must be the public address derived from `POOL_PRIVATE_KEY`. Use MetaMask, Rabby, or `cast wallet new` to generate a keypair.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Single Process                          │
│                                                             │
│  ┌──────────────────────┐    ┌─────────────────────────┐   │
│  │   Next.js App Router  │    │   Flight Checker Worker  │   │
│  │  app/api/*            │    │   index.ts + checker.ts  │   │
│  │                       │    │                          │   │
│  │  POST /api/insure     │    │  Every 5 min:            │   │
│  │  GET  /api/policy/:id │    │  • cleanup stale entries │   │
│  │  GET  /api/health     │    │  • parallel flight poll  │   │
│  │  GET  /api/flights    │    │  • fire payouts          │   │
│  │  /admin  (panel)      │    │                          │   │
│  └──────────┬────────────┘    └────────────┬────────────┘   │
│             └──────────────┬───────────────┘                 │
│                            ▼                                 │
│                   ┌─────────────────┐                        │
│                   │  PolicyStore    │ ← policies.json on disk│
│                   └─────────────────┘                        │
└────────────────────────────────────────────────────────────-─┘
         │                                     │
         ▼                                     ▼
  AeroDataBox API                      Tempo Blockchain
  (flight status)                      (pathUSD ERC-20)
```

### How a policy flows

```
User pays 1 pathUSD (MPP)
    → POST /api/insure validates flight + creates policy
    → FlightChecker polls every 5 min
        → Departed + delay ≥ 60min?
            → Pre-lock policy as paid_out
            → Transfer 5 pathUSD on Tempo
            → Confirm receipt → store txHash
        → Cancelled / no delay → mark expired
```

### Module Map

| File                        | Role                                                                |
| --------------------------- | ------------------------------------------------------------------- |
| `app/`                      | Next.js pages + API routes                                          |
| `index.ts`                  | Checker entry point — config, boot, graceful shutdown               |
| `src/server.ts`             | Hono API (MPP gating, rate limiter, validation)                     |
| `src/checker.ts`            | Polling cron — parallel `Promise.allSettled` across active policies |
| `src/flight.ts`             | AeroDataBox adapter — fetch + normalize + 4-min cache               |
| `src/payout.ts`             | viem payout engine — balance check + ERC-20 transfer                |
| `src/store.ts`              | Policy store — `Map<string, Policy>` + JSON file persistence        |
| `src/types.ts`              | Shared types, interfaces, constants                                 |
| `contracts/FlightGuard.sol` | Optional on-chain policy registry                                   |

---

## API Reference

### `POST /api/insure` — Buy a policy

**MPP-gated** (1 pathUSD premium) · **Rate limit**: 10 req/60s per IP · **Body limit**: 1 KB

```json
// Request
{ "flightNumber": "LA3251", "date": "2026-04-21", "payoutAddress": "0xYourWallet" }

// 201 Response
{
  "policyId": "uuid-v4",
  "flightNumber": "LA3251",
  "date": "2026-04-21",
  "scheduledDeparture": "2026-04-21T10:00:00Z",
  "premium": "1.00",
  "payoutAmount": "5.00",
  "payoutAddress": "0x...",
  "status": "active",
  "message": "Policy active. Payout of 5.00 pathUSD fires automatically if departure delay exceeds 60 minutes."
}
```

**Validation:** `flightNumber` 2–8 alphanumeric · `date` valid future date · `payoutAddress` EVM address

### `GET /api/policy/:id` — Check policy status

```json
{
  "policy": {
    "id": "uuid-v4",
    "status": "active | paid_out | expired | cancelled",
    "payoutTxHash": "0x… (set when paid_out)",
    "lastFlightStatus": "Departed",
    "lastCheckedAt": 1711980000000
  }
}
```

### `GET /api/health` — Pool stats

```json
{
  "status": "ok",
  "pool": { "address": "0x…", "balance": "245.00 pathUSD" },
  "policies": { "active": 3, "paid_out": 1, "expired": 2, "cancelled": 0 },
  "config": {
    "premium": "1.00 pathUSD",
    "payoutMultiplier": 5,
    "delayThresholdMin": 60
  }
}
```

### `GET /api/flights?date=YYYY-MM-DD` — Search flights

### Admin (password auth via `POST /api/admin/auth`)

- `GET /api/admin/policies` — all policies
- `GET /api/admin/audit` — system audit log

---

## MPP Demo (CLI)

```bash
# Install mppx globally
npm i -g mppx

# Create a funded testnet wallet
mppx account create

# Buy a policy — mppx handles the 402 challenge automatically
mppx http://localhost:3000/api/insure \
  --method POST \
  --data '{"flightNumber":"LA3251","date":"2026-04-21","payoutAddress":"0xYourWallet"}'

# Check your policy
curl http://localhost:3000/api/policy/{policyId}

# Watch the checker fire (default: every 5 min)
npm run checker
```

---

## Testing

```bash
npm test                 # 28 unit tests (vitest)
npm run test:watch       # watch mode
npm run test:contracts   # Hardhat contract tests
npm run typecheck        # TypeScript strict check
```

---

## Tempo Network

|          | Testnet                                      | Mainnet            |
| -------- | -------------------------------------------- | ------------------ |
| Chain ID | 42431                                        | 4217               |
| RPC      | rpc.moderato.tempo.xyz                       | rpc.tempo.xyz      |
| Explorer | explore.testnet.tempo.xyz                    | explore.tempo.xyz  |
| pathUSD  | `0x20c0000000000000000000000000000000000000` | configured via env |

---

## Underwriting Note

The demo runs a single-wallet insurer pool. For production:

- **DAO liquidity pool** — stakers earn premium yield
- **Reinsurance API** — pass risk to a backstop provider
- **Overcollateralized vault** — idle pathUSD earns DeFi yield

---

## License

MIT — OCTO INTELIGÊNCIA DE DADOS LTDA
