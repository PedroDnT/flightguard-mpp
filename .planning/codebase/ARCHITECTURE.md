# Architecture

**Analysis Date:** 2026-03-21

## Pattern Overview

**Overall:** Event-Driven Parametric Insurance Engine

**Key Characteristics:**
- **Parametric Trigger**: Automatic payout fired by objective flight delay data, not claims processing
- **MPP-Gated Premium**: Insurance purchased via Machine Payments Protocol (single micropayment gate)
- **Async Polling**: Background checker continuously monitors policies and executes payouts
- **Blockchain Settlement**: All transfers executed directly on Tempo chain via viem
- **In-Memory State**: Policies stored in-memory, not persisted (demo/development mode)

## Layers

**HTTP Server (Hono):**
- Purpose: Accept insurance purchase requests, serve policy queries, expose health metrics
- Location: `src/server.ts`
- Contains: Route handlers, MPP payment verification, policy issuance
- Depends on: Store, FlightChecker, PayoutEngine, Flight data API
- Used by: External clients via REST API

**Business Logic — Policy Issuance:**
- Purpose: Validate flight data and create active insurance policies
- Location: `src/server.ts` POST /insure handler (lines 34-114)
- Contains: MPP charge verification, flight existence check, policy creation
- Depends on: Flight API (AeroDataBox), Store
- Used by: Server layer

**Business Logic — Flight Monitoring:**
- Purpose: Poll flight status at regular intervals and detect delay conditions
- Location: `src/checker.ts`
- Contains: Automatic check cycle runner, delay detection, status transitions
- Depends on: Flight API (AeroDataBox), Store, PayoutEngine
- Used by: Main event loop (started at boot)

**Blockchain Layer — Payout Execution:**
- Purpose: Send pathUSD transfers to policyholders when conditions are met
- Location: `src/payout.ts`
- Contains: Viem wallet client setup, ERC-20/TIP-20 transfer logic, balance checks
- Depends on: Tempo RPC, pathUSD token contract
- Used by: FlightChecker

**Data Access — Policy Store:**
- Purpose: In-memory CRUD operations for all policy state
- Location: `src/store.ts`
- Contains: Policy map, status mutations, query helpers
- Depends on: Nothing (pure data structure)
- Used by: Server, FlightChecker, HTTP endpoints

**External Integration — Flight Data:**
- Purpose: Fetch real-time flight status and delay information from AeroDataBox
- Location: `src/flight.ts`
- Contains: API wrapper, response normalization, helper functions for delay/status checks
- Depends on: RapidAPI AeroDataBox endpoint
- Used by: Server (policy validation), FlightChecker (status monitoring)

**Types & Configuration:**
- Purpose: Centralized TypeScript definitions and runtime configuration constants
- Location: `src/types.ts`
- Contains: All interfaces (Policy, FlightInfo, AppConfig), status enums, Tempo network definitions
- Depends on: Nothing
- Used by: All modules

**Entry Point & Bootstrap:**
- Purpose: Initialize runtime config, start HTTP server and checker loop
- Location: `index.ts`
- Contains: Env var validation, server instantiation, graceful shutdown handling
- Depends on: All modules
- Used by: Node.js runtime

## Data Flow

**Policy Purchase (Synchronous):**

1. Client calls `POST /insure` with flight details via MPP (includes payment)
2. Hono server verifies MPP challenge → returns 402 if unpaid, continues if paid
3. Server fetches flight info from AeroDataBox to confirm flight exists and get scheduled departure
4. Server creates policy in store with `status: 'active'` and calculates payout amount
5. Server returns `InsureResponse` with policyId, premium, payout amount, and scheduled departure
6. Client receives policy details and can track status via `GET /policy/:id`

**Automatic Payout Execution (Asynchronous):**

1. FlightChecker wakes on interval (default 5 min, configurable via `CHECK_INTERVAL_MS`)
2. Loads all `active` policies from store
3. For each policy:
   - Fetches current flight status from AeroDataBox
   - Records last checked time and status in store
   - Evaluates four conditions:
     - **Cancelled**: Mark expired (no payout for cancellations per policy design)
     - **Delay meets threshold**: Trigger payout → `sendPayout()` → wait for confirmation → mark `paid_out`
     - **Terminal status (Landed/Arrived) + no qualifying delay**: Mark `expired`
     - **In-progress**: No action, continue monitoring
4. Payout flows via PayoutEngine:
   - Derives signer from pool private key
   - Calls `balanceOf()` on pathUSD contract
   - If balance sufficient, calls `transfer(policyholder, payoutAmount)`
   - Waits for receipt (30s timeout, Tempo has sub-second finality)
   - If successful, marks policy as `paid_out` with txHash
   - If insufficient balance or failed, logs error and keeps policy active for retry

**Health Check (Synchronous):**

1. Client calls `GET /health`
2. PayoutEngine queries pathUSD balance
3. Store returns policy counts by status
4. Server responds with pool address, balance, policy distribution, and active config parameters

**State Management:**

All state is managed via `store` singleton:
- Policy creation adds to Map with UUID v4 key
- Policy mutations (mark paid out, mark expired, record check) update fields and `updatedAt` timestamp
- Queries filter by status (`active`, `paid_out`, `expired`, `cancelled`)
- No persistence — all state lost on server restart
- Thread-safe per Node.js single-threaded event loop model

## Key Abstractions

**Policy:**
- Purpose: Represents a single insured flight
- Examples: `src/types.ts` lines 15-29, created in `src/store.ts` line 23-34
- Pattern: Single source of truth in store; status transitions determined by FlightChecker logic

**FlightInfo (Normalized):**
- Purpose: Abstract AeroDataBox API response into consistent type
- Examples: `src/types.ts` lines 55-64, normalized in `src/flight.ts` lines 87-138
- Pattern: Tolerant parsing — missing fields default to 'Unknown' or empty, preventing crashes on API variance

**PayoutRequest & PayoutResult:**
- Purpose: Encapsulate transfer instructions and outcomes
- Examples: `src/types.ts` lines 107-117, issued in `src/checker.ts` line 158, executed in `src/payout.ts` line 79
- Pattern: Decouples checker logic from blockchain details

**CheckResult:**
- Purpose: Summarize outcome of a single policy check cycle
- Examples: `src/types.ts` lines 123-130, returned in `src/checker.ts` lines 80-211
- Pattern: Enables logging and metrics without storing transient state

**AppConfig:**
- Purpose: All runtime parameters loaded from environment
- Examples: `src/types.ts` lines 136-159, loaded in `index.ts` lines 13-40
- Pattern: Immutable after startup; no runtime config changes

## Entry Points

**`index.ts`:**
- Location: `/Users/pedrotodescan/Documents/Dev/flightguard-mpp/index.ts`
- Triggers: Node.js process start
- Responsibilities: Load environment, validate required keys, instantiate app and checker, bind shutdown handlers, start HTTP server on configured port

**`POST /insure` (Hono route):**
- Location: `src/server.ts` lines 34-114
- Triggers: Client HTTP POST with flight details + MPP payment
- Responsibilities: Verify payment, validate input, fetch flight, create policy, return policy details

**`GET /policy/:id` (Hono route):**
- Location: `src/server.ts` lines 119-130
- Triggers: Client HTTP GET with policy ID
- Responsibilities: Look up policy, return full policy record

**`GET /health` (Hono route):**
- Location: `src/server.ts` lines 135-158
- Triggers: Client HTTP GET
- Responsibilities: Query pool balance, count policies by status, return diagnostic info

**`FlightChecker.start()` (cron loop):**
- Location: `src/checker.ts` lines 30-47
- Triggers: Called once at boot, then repeats on interval
- Responsibilities: Run complete check cycle on all active policies, determine status transitions, orchestrate payouts

## Error Handling

**Strategy:** Fail-safe with logging; missing data or API errors do not crash checker

**Patterns:**

- **Flight not found (404)**: Return `null` from `fetchFlightInfo()`, checker logs "skipping", policy stays active for next cycle
- **Network error on flight check**: Caught in checker try-catch (line 79-85), logged, cycle continues
- **Insufficient pool balance**: Logged as error, payout skipped, policy stays active for retry when funded
- **Transaction revert**: Caught, logged as "REVERTED", txHash recorded for audit
- **Payout exception (viem errors)**: Caught in `sendPayout()` (lines 149-153), logged, returns `{success: false, error}`
- **Missing env var at boot**: Hard failure in `loadConfig()` (lines 14-25) — process exits with code 1

## Cross-Cutting Concerns

**Logging:** Console.log throughout with context prefixes (`[SERVER]`, `[CHECKER]`, `[PAYOUT]`, `[FLIGHT]`, `[STORE]`), useful for debugging and monitoring in production logs

**Validation:**
- Input: Date format validation (YYYY-MM-DD regex), address format validation (0x + 40 hex chars)
- Flight: Existence check via API before policy creation
- Delay: Extracted from API response, validated as numeric

**Authentication:** MPP payment gate on `/insure` only; other routes open (GET /policy/:id, GET /health are intentionally public for transparency)

**Blockchain Interaction:** Viem client handles gas estimation and signing; no manual nonce management; sub-second Tempo finality means 30s wait suffices

---

*Architecture analysis: 2026-03-21*
