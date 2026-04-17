# FlightGuard MPP - Next.js Webapp

## Overview

FlightGuard is a parametric flight delay insurance platform built on the Tempo blockchain using the Machine Payments Protocol (MPP). This Next.js application provides a user-friendly interface for purchasing flight insurance and an admin panel for managing the insurance pool.

## Features

### User Features
- **Flight Search**: Search for flights by date and purchase insurance
- **Buy Insurance**: Purchase parametric insurance with MPP micropayments (1 pathUSD premium)
- **Policy Tracking**: Track policy status and view payout information
- **Automatic Payouts**: Receive 5 pathUSD automatically if flight is delayed 60+ minutes

### Admin Features
- **Simple Password Authentication**: Secure admin access with environment variable password
- **Pool Management**: View pool balance and statistics
- **Policy Overview**: See all policies and their statuses
- **Audit Logs**: Track all system events and admin actions

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **Payment**: MPP (Machine Payments Protocol)
- **Blockchain**: Tempo (EVM-compatible)
- **Flight Data**: AeroDataBox via RapidAPI
- **Storage**: JSON files (policies.json, audit.json)

## Setup

### Prerequisites
- Node.js >= 20
- RapidAPI account → [AeroDataBox API](https://rapidapi.com/aedbx-aedbx/api/aerodatabox)
- Tempo testnet wallet with pathUSD → [Faucet](https://docs.tempo.xyz/quickstart/faucet)

### Installation

```bash
npm install
```

### Configuration

```bash
cp .env.example .env
# Edit .env with your values:
# - POOL_PRIVATE_KEY, POOL_ADDRESS (your Tempo wallet)
# - RAPIDAPI_KEY (for flight data)
# - ADMIN_PASSWORD (for admin panel)
```

### Fund the Pool

```bash
npm run faucet  # Testnet only - funds your pool wallet with pathUSD
```

### Development

```bash
# Start Next.js dev server
npm run dev

# Start checker service (in another terminal)
npm run checker
```

Visit `http://localhost:3000`

### Production Build

```bash
npm run build
npm run start  # Start Next.js production server
npm run checker  # Start background checker (in another terminal/process)
```

## Deployment

### Render.io (Recommended)

1. Push code to GitHub
2. Connect repository to Render.io
3. Render will detect `render.yaml` and create:
   - Web service (Next.js app)
   - Worker service (background checker)
4. Configure environment variables in Render dashboard
5. Deploy!

The `render.yaml` file configures both services with shared persistent storage for JSON files.

### Environment Variables

Required for deployment:
- `POOL_PRIVATE_KEY` - Private key for pool wallet
- `POOL_ADDRESS` - Public address of pool wallet
- `RAPIDAPI_KEY` - AeroDataBox API key
- `ADMIN_PASSWORD` - Password for admin panel access
- `PATHUSD_ADDRESS` - pathUSD token address (default: 0x20c000...)
- `TEMPO_RPC_URL` - Tempo RPC endpoint
- `CHAIN_ID` - 42431 (testnet) or 4217 (mainnet)

## Usage

### User Flow

1. Visit homepage and click "Find Your Flight"
2. Search for flights by date
3. Click "Buy Insurance" on desired flight
4. Enter payout wallet address
5. Complete MPP payment (1 pathUSD)
6. Policy is created and monitored automatically
7. If flight is delayed 60+ minutes, receive 5 pathUSD automatically

### Admin Flow

1. Visit `/admin`
2. Login with admin password
3. View pool balance and statistics
4. Monitor all policies
5. Review audit logs

## API Endpoints

### Public Routes
- `GET /api/health` - Pool status and statistics
- `GET /api/flights?date=YYYY-MM-DD` - Search flights
- `POST /api/insure` - Create insurance policy (MPP-gated)
- `GET /api/policy/:id` - Get policy details

### Admin Routes (authentication required)
- `POST /api/admin/auth` - Admin login
- `GET /api/admin/policies` - List all policies
- `GET /api/admin/audit` - Get audit logs

## License

MIT — OCTO INTELIGÊNCIA DE DADOS LTDA
