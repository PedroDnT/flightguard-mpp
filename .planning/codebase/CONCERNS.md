# Concerns — FlightGuard MPP

*Last updated: 2026-03-23 — all critical/high issues resolved*

---

## Resolved Issues

### ✅ 1. No Data Persistence
**File:** `src/store.ts`
**Status:** Fixed — `loadFromDisk()` / `saveToDisk()` added. Policies persist to `policies.json` on every mutation. Path configurable via `STORE_PATH` env var. Server restart no longer loses active policies.

---

### ✅ 2. Arrival `actualTime` Field Bug
**File:** `src/flight.ts:121-125`
**Status:** Verified correct — `normalizeFlightInfo()` reads `raw.arrival.actualTime.local/utc` (not scheduledTime). Comment added confirming the field.

---

### ✅ 3. No Payout Retry / Error Recovery
**File:** `src/checker.ts`
**Status:** Addressed — failed payouts roll back policy status to `active`, so the next checker cycle retries automatically. The pre-lock to `paid_out` before `sendPayout()` also prevents double-spend from concurrent cycles.

---

### ✅ 4. No Rate Limiting on Public Endpoints
**File:** `src/server.ts`
**Status:** Fixed — in-memory IP-based rate limiter added to `POST /insure`. Limit: 10 requests per IP per 60 seconds. Returns 429 when exceeded. No external dependency required.

---

### ✅ 5. Private Key in Environment Variable
**File:** `index.ts`, `.env`
**Status:** Accepted — standard practice for demo/hackathon. Pool wallet compromise requires `.env` access. Acceptable risk given scope; production would use a KMS or hardware wallet.

---

### ✅ 6. Input Validation
**File:** `src/server.ts`
**Status:** Fixed — regex validation for flight number (IATA format: 2–8 alphanumeric), full semantic date validation (calendar check + past date rejection), EVM address format check. `bodyLimit(1KB)` middleware added.

---

### ✅ 7. Sequential Policy Checking
**File:** `src/checker.ts`
**Status:** Fixed — sequential `for-await` loop replaced with `Promise.allSettled()`. All active policies now checked concurrently. Per-policy errors are caught and logged without stopping the cycle.

---

### ✅ 8. Health Check Iterates Full Store
**File:** `src/server.ts`
**Status:** Already efficient — `countByStatus()` iterates `this.policies` values once; no full copy. Acceptable for demo scale.

---

### ✅ 9. Zero Test Coverage
**Status:** Fixed — vitest added with 28 unit tests:
- `test/flight.test.ts` — 14 tests for `getDepartureDelayMinutes`, `hasFlightDeparted`, `isFlightTerminal`
- `test/store.test.ts` — 14 tests for `PolicyStore` create/update/cleanup lifecycle

---

### ⚠️ 10. Unstructured Logging
**File:** all modules
**Status:** Deferred — `console.log` with `[MODULE]` prefixes. Sufficient for hackathon. Production would add structured JSON logging (pino/winston) with correlation IDs.

---

### ✅ 11. Single RapidAPI Key — Quota Exhaustion
**File:** `src/flight.ts`
**Status:** Mitigated — 4-minute in-memory cache added (`flightCache` Map, TTL = 240s). Same flight/date pair is fetched at most once per 4 minutes regardless of how many checker cycles overlap. Null results (404) are also cached to avoid re-hitting the API for unknown flights.

---

### ✅ 12. No Policy TTL/Cleanup
**File:** `src/store.ts`
**Status:** Fixed — `cleanup(maxAgeMs)` method added. Called at the start of every `runCycle()` with a 7-day TTL. Removes policies in `paid_out`, `expired`, or `cancelled` status with `updatedAt` older than the cutoff.

---

## Summary

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | No data persistence | 🔴 Critical | ✅ Fixed |
| 2 | Arrival actualTime bug | 🔴 Critical | ✅ Verified correct |
| 3 | No payout retry | 🔴 Critical | ✅ Addressed via rollback |
| 4 | No rate limiting | 🟠 High | ✅ Fixed |
| 5 | Private key in env | 🟠 High | ✅ Accepted (hackathon scope) |
| 6 | Weak input validation | 🟡 Medium | ✅ Fixed |
| 7 | Sequential policy checks | 🟡 Medium | ✅ Fixed |
| 8 | Health check iterates store | 🟢 Low | ✅ Already fine |
| 9 | Zero test coverage | 🟠 High | ✅ Fixed — 28 tests |
| 10 | Unstructured logging | 🟡 Medium | ⚠️ Deferred |
| 11 | Single RapidAPI key | 🟠 High | ✅ Mitigated via cache |
| 12 | No policy TTL/cleanup | 🟡 Medium | ✅ Fixed |
