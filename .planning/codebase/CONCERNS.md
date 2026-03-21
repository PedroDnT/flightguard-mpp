# Concerns — FlightGuard MPP

## Critical Issues

### 1. No Data Persistence (Blocker for Production)
**File:** `src/store.ts`

The `PolicyStore` is a plain `Map<string, Policy>` held in process memory. All policies are lost on every server restart. There is no database, no file persistence, no Redis — nothing.

**Impact:** Any deployment restart (crash, redeploy, scale-out) destroys all active policies. Payouts will never fire for policies created before the restart.

**Risk Level:** 🔴 Critical

---

### 2. Known Bug: Arrival `actualTime` Reads Wrong Field
**File:** `src/flight.ts:122-125`

```typescript
// BUG: reads scheduledTime instead of actualTime
actualTime: raw.arrival?.actualTime
  ? {
      local: raw.arrival.scheduledTime?.local ?? '',  // ← wrong field
      utc: raw.arrival.scheduledTime?.utc ?? '',      // ← wrong field
    }
  : undefined,
```

When a flight has landed, `arrival.actualTime` will always show the scheduled time values. Delay calculations using arrival `actualTime` will be incorrect.

**Risk Level:** 🔴 Critical (data correctness)

---

### 3. No Payout Retry / Error Recovery
**File:** `src/checker.ts`

If a payout transaction fails (RPC timeout, gas issue, nonce conflict), the checker logs the error but does not retry. The policy status may not be updated, leaving it in a limbo state where it keeps getting checked but never paid out or expired.

**Risk Level:** 🔴 Critical (financial loss)

---

## Security Concerns

### 4. No Rate Limiting on Public Endpoints
**File:** `src/server.ts`

`POST /insure` is open to the public with no rate limiting. An attacker can spam policy creation, exhausting the pool's pathUSD balance or hitting RapidAPI quota limits.

**Risk Level:** 🟠 High

---

### 5. Private Key in Environment Variable (Plain Text)
**File:** `src/config.ts`, `.env`

`POOL_PRIVATE_KEY` is loaded from environment as a plain string. If the server process is compromised or environment variables are leaked (e.g., via a debug endpoint), the pool wallet is fully compromised.

**Risk Level:** 🟠 High

---

### 6. No Input Validation Beyond Regex
**File:** `src/server.ts`

Flight number and date inputs are validated with simple regex patterns. No use of Zod or a validation library. Edge cases in flight number formats (e.g., codeshare flights) may pass or fail unexpectedly.

**Risk Level:** 🟡 Medium

---

## Performance Concerns

### 7. Sequential Policy Checking
**File:** `src/checker.ts`

The checker iterates all active policies sequentially with `await` in a loop. With many active policies, each AeroDataBox API call blocks the next. Check cycles will grow linearly with policy count.

**Risk Level:** 🟡 Medium (scaling concern)

---

### 8. Full Store Iteration on Health Check
**File:** `src/server.ts`

The `GET /health` endpoint calls `store.getAll()` and counts all policies. With a large policy store, this adds unnecessary work to a health check endpoint that Kubernetes/load balancers call frequently.

**Risk Level:** 🟢 Low

---

## Technical Debt

### 9. Zero Test Coverage
No test files exist in the project. The known bug at `src/flight.ts:122` would have been caught immediately by a unit test. All business logic is untested.

**Risk Level:** 🟠 High (quality/reliability)

---

### 10. No Logging Structure / Correlation IDs
**File:** `src/server.ts`, `src/checker.ts`

Logging uses `console.log`/`console.error` with no structured format (JSON), no correlation IDs, and no log levels. Debugging production issues requires grepping raw text logs.

**Risk Level:** 🟡 Medium

---

### 11. RapidAPI Quota as Single Point of Failure
**File:** `src/flight.ts`

All flight data comes through a single RapidAPI key hitting AeroDataBox. No fallback API, no caching of flight data between checker cycles for the same flight. One quota exhaustion stops all policy checking.

**Risk Level:** 🟠 High

---

### 12. No Policy Cleanup / TTL
**File:** `src/store.ts`

Expired and paid-out policies remain in the in-memory store forever. Over time (if the server runs without restart), the store grows unboundedly and the checker iterates stale records on every cycle.

**Risk Level:** 🟡 Medium

---

## Summary Table

| # | Issue | Severity | File |
|---|-------|----------|------|
| 1 | No data persistence | 🔴 Critical | `src/store.ts` |
| 2 | Arrival actualTime bug | 🔴 Critical | `src/flight.ts:122` |
| 3 | No payout retry | 🔴 Critical | `src/checker.ts` |
| 4 | No rate limiting | 🟠 High | `src/server.ts` |
| 5 | Private key in env | 🟠 High | `src/config.ts` |
| 6 | Weak input validation | 🟡 Medium | `src/server.ts` |
| 7 | Sequential policy checks | 🟡 Medium | `src/checker.ts` |
| 8 | Health check iterates store | 🟢 Low | `src/server.ts` |
| 9 | Zero test coverage | 🟠 High | all |
| 10 | Unstructured logging | 🟡 Medium | all |
| 11 | Single RapidAPI key | 🟠 High | `src/flight.ts` |
| 12 | No policy TTL/cleanup | 🟡 Medium | `src/store.ts` |
