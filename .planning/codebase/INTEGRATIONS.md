# External Integrations

**Analysis Date:** 2026-03-21

## APIs & External Services

**Flight Data:**
- AeroDataBox (via RapidAPI)
  - What it's used for: Real-time flight status, delay information, departure/arrival times
  - SDK/Client: HTTP fetch (built-in)
  - Auth: `RAPIDAPI_KEY` environment variable (RapidAPI authentication key)
  - Base URL: `https://aerodatabox.p.rapidapi.com`
  - Endpoint: `/flights/number/{flightNumber}/{date}`
  - Headers required:
    - `X-RapidAPI-Key` - Set to RAPIDAPI_KEY
    - `X-RapidAPI-Host` - `aerodatabox.p.rapidapi.com`
  - Response shape: `FlightInfo` interface in `src/types.ts`
    - Flight number, status (Scheduled/Departed/EnRoute/Landed/Arrived/Cancelled/Diverted)
    - Departure/arrival airport info (IATA, name, scheduled/actual times)
    - Delay information (minutes, reason)
  - Error handling: 404 returns null (flight not found), non-200 throws error
  - Implementation: `src/flight.ts` - `fetchFlightInfo()`

## Data Storage

**Databases:**
- In-Memory Map (no external database)
  - Type: JavaScript Map stored in application memory
  - Client: Custom `PolicyStore` class in `src/store.ts`
  - Persistence: None - policies lost on server restart
  - Use case: Store active insurance policies during runtime

**File Storage:**
- None

**Caching:**
- None

## Blockchain & Web3

**Network:**
- Tempo blockchain
  - Mainnet:
    - Chain ID: 4217
    - RPC URL: `https://rpc.tempo.xyz`
    - Explorer: `https://explore.tempo.xyz`
  - Testnet (Moderato):
    - Chain ID: 42431
    - RPC URL: `https://rpc.moderato.tempo.xyz` (default)
    - Explorer: `https://explore.testnet.tempo.xyz`
  - Configuration: `TEMPO_RPC_URL` and `CHAIN_ID` env vars

**Smart Contracts:**
- pathUSD Token (TIP-20 / ERC-20 compatible)
  - Address (testnet): `0x20c0000000000000000000000000000000000000` (default, configurable via `PATHUSD_ADDRESS`)
  - Functions used:
    - `balanceOf(address)` - Check pool wallet balance (read)
    - `transfer(to, amount)` - Send payouts to policyholders (write)
  - Decimals: 6 (like USDC)
  - Used for: Premium payments and payout disbursements

**Wallet & Signing:**
- Pool Wallet (controlled by insurer)
  - Private key: `POOL_PRIVATE_KEY` env var (hex format)
  - Address: `POOL_ADDRESS` env var
  - Purpose: Signs payout transactions on Tempo
  - Used by: `PayoutEngine` in `src/payout.ts` via viem

**Interaction Library:**
- viem 2.0+
  - Client types: `WalletClient` (for signing), `PublicClient` (for reading)
  - Transport: HTTP to Tempo RPC endpoint
  - Implementation: `src/payout.ts` - `PayoutEngine` class

## Micropayment Protocol

**MPP (Micropayment Protocol):**
- Provider: mppx 0.4.5
- Used for: Gating the POST /insure endpoint with pathUSD payment requirement
- Payment flow:
  1. Client initiates POST /insure without payment
  2. Server responds with HTTP 402 challenge (MPP payment request)
  3. Client signs and submits payment transaction
  4. Server validates payment receipt via MPP
  5. On success, policy is created and returned with receipt
- Configuration: `src/server.ts` - Mppx initialized with:
  - Method: Tempo payments
  - Currency: pathUSD token address
  - Recipient: Pool address (insurer)
  - Amount: `config.premiumAmount` (e.g., "1.00" pathUSD)

## Authentication & Identity

**Auth Provider:**
- None centralized (blockchain-native)

**Authentication Approach:**
- Blockchain wallet signature via MPP for payments
- No user authentication required - API is public
- Authorization gated by micropayment requirement

## Monitoring & Observability

**Error Tracking:**
- None (built-in logging only)

**Logs:**
- Console logging with prefixes: `[SERVER]`, `[FLIGHT]`, `[PAYOUT]`, `[CHECKER]`, `[STORE]`
- No external log aggregation
- Logged events:
  - Policy creation/updates
  - Flight data fetches and errors
  - Payout transactions (submitted, confirmed, failed)
  - Checker cycle progress and actions
  - Server startup and health checks

**Health Monitoring:**
- GET /health endpoint returns:
  - Pool wallet address and pathUSD balance
  - Policy counts by status (active, paid_out, expired, cancelled)
  - Network and chain configuration
  - Insurance parameters (premium, multiplier, delay threshold)

## CI/CD & Deployment

**Hosting:**
- Self-hosted (provided application runs on Node.js)
- Expected deployment: Cloud VM, container, or local server

**CI Pipeline:**
- None configured (no GitHub Actions or similar in codebase)

## Environment Configuration

**Required env vars at startup:**
- `POOL_PRIVATE_KEY` - Pool wallet signing key
- `POOL_ADDRESS` - Pool wallet address
- `RAPIDAPI_KEY` - AeroDataBox API key

**Critical env vars with safe defaults:**
- `TEMPO_RPC_URL` - Defaults to testnet
- `CHAIN_ID` - Defaults to testnet (42431)
- `PATHUSD_ADDRESS` - Defaults to testnet token address

**Secrets location:**
- `.env` file (not committed, listed in `.gitignore`)
- Environment variables passed at runtime
- Private key must be protected - not logged or exposed

## Webhooks & Callbacks

**Incoming:**
- None - API is polling-based, not event-driven

**Outgoing:**
- None - No external webhooks triggered by app

## Data Flow Summary

1. **Insurance Purchase:**
   - Client calls POST /insure with flight details + MPP payment
   - AeroDataBox validates flight exists
   - Policy stored in memory with premium paid
   - Payout amount calculated from config

2. **Flight Monitoring:**
   - FlightChecker runs on interval (`CHECK_INTERVAL_MS`)
   - Polls AeroDataBox for each active policy
   - Records flight status and delay

3. **Payout Trigger:**
   - When delay exceeds threshold and flight has departed:
   - PayoutEngine signs payout transaction via viem
   - Sends pathUSD transfer from pool to policyholder
   - Records tx hash in policy
   - Policy marked as "paid_out"

---

*Integration audit: 2026-03-21*
