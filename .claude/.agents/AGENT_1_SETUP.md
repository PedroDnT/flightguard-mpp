# AGENT 1 — Project Scaffold & Setup

## Your Role
Bootstrap the entire project. Create `package.json`, `tsconfig.json`, `.env.example`, and install all dependencies. Do NOT write any application logic — that belongs to later agents.

---

## Step 1 — Create package.json

Create `/package.json` with this exact content:

```json
{
  "name": "flightguard-mpp",
  "version": "0.1.0",
  "description": "Parametric flight delay insurance on Tempo using MPP micropayments",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch index.ts",
    "start": "tsx index.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "mppx": "^0.4.5",
    "hono": "^4.0.0",
    "@hono/node-server": "^1.0.0",
    "viem": "^2.0.0",
    "dotenv": "^16.0.0",
    "node-fetch": "^3.0.0"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

---

## Step 2 — Create tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*", "index.ts"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Step 3 — Create .env.example

```bash
# ============================================================
# FlightGuard MPP — Environment Variables
# Copy to .env and fill in values before running
# ============================================================

# --- TEMPO NETWORK ---
# Pool wallet: this is the "insurer" — funds it pays out from
POOL_PRIVATE_KEY=0x...your_private_key_here...
POOL_ADDRESS=0x...your_pool_wallet_address...

# Tempo testnet (default) — switch to mainnet for production
TEMPO_RPC_URL=https://rpc.moderato.tempo.xyz
CHAIN_ID=42431

# pathUSD stablecoin — do not change for testnet
PATHUSD_ADDRESS=0x20c0000000000000000000000000000000000000

# --- FLIGHT DATA ---
# Get a free key at https://rapidapi.com/aedbx-aedbx/api/aerodatabox
RAPIDAPI_KEY=your_rapidapi_key_here

# --- SERVER ---
PORT=3000

# --- INSURANCE PARAMETERS ---
# Premium amount in USD (stablecoin units)
PREMIUM_AMOUNT=1.00

# Payout = premium * this multiplier
PAYOUT_MULTIPLIER=5

# Flight must be delayed by this many minutes to trigger payout
DELAY_THRESHOLD_MIN=60

# How often the checker polls flights (milliseconds)
# 300000 = 5 minutes
CHECK_INTERVAL_MS=300000
```

---

## Step 4 — Create src/ directory structure

Create these empty placeholder files (agents 2-8 will fill them):

```
src/types.ts
src/flight.ts
src/payout.ts
src/store.ts
src/server.ts
src/checker.ts
index.ts
```

Each placeholder should contain only:
```ts
// Placeholder — filled by Agent N
export {}
```

---

## Step 5 — Run installation

```bash
npm install
```

Verify no errors. If there are peer dependency warnings, ignore them — they are non-fatal for this demo.

---

## Step 6 — Verify setup

Run:
```bash
npx tsc --noEmit
```

With empty placeholders this should produce zero errors.

---

## Completion Checklist

- [ ] `package.json` created
- [ ] `tsconfig.json` created  
- [ ] `.env.example` created
- [ ] All `src/*.ts` placeholder files created
- [ ] `index.ts` placeholder created
- [ ] `npm install` completed without fatal errors

## Hand-off to Agent 2

Once complete, Agent 2 can proceed to write `src/types.ts`.
