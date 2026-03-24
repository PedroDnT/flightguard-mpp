# Testing Patterns

*Last updated: 2026-03-23*

---

## Test Frameworks

### Unit Tests — vitest

**Runner:** vitest (`vitest@^4.1.1`)
**Config:** `vitest.config.ts` — `environment: 'node'`, `include: ['test/**/*.test.ts']`
**Run Commands:**
```bash
npm test              # vitest run (CI mode)
npm run test:watch    # vitest (watch mode)
```

**28 tests, 0 failures.**

### Contract Tests — Hardhat

**Runner:** Hardhat (via `@nomicfoundation/hardhat-toolbox` ^5.0.0) — runs Mocha under the hood
**Config:** `hardhat.config.js`
**Run Commands:**
```bash
npm run test:contracts             # Run all Hardhat/Mocha contract tests
REPORT_GAS=true npm run test:contracts  # With gas cost reporter
```

---

## Unit Test Coverage

### `test/flight.test.ts` — 14 tests

Tests pure functions exported from `src/flight.ts`. No network calls, no mocking.

```typescript
import { getDepartureDelayMinutes, hasFlightDeparted, isFlightTerminal } from '../src/flight.js'
```

**`getDepartureDelayMinutes`:**
- Returns 0 when no delays field
- Returns first delay's minutes when present
- Returns 0 for empty delays array
- Returns 0 when delays is undefined

**`hasFlightDeparted`:** (returns true for Departed, EnRoute, Landed, Arrived; false for Scheduled, Unknown, Cancelled)

**`isFlightTerminal`:** (returns true for Landed, Arrived, Cancelled, Diverted; false for Scheduled, Departed, EnRoute)

**Helper:**
```typescript
function makeFlightInfo(overrides: Partial<FlightInfo> = {}): FlightInfo {
  return { number: 'LA3251', status: 'Scheduled', departure: { iata: 'GRU', name: 'Guarulhos', delays: [] }, arrival: { iata: 'GIG', name: 'Galeão' }, ...overrides }
}
```

---

### `test/store.test.ts` — 14 tests

Tests `PolicyStore` lifecycle. Each test gets a fresh store with no disk I/O:

```typescript
function makeStore() {
  return new PolicyStore('/dev/null/nonexistent-test-store.json')
}
```

**`PolicyStore.create`:**
- Creates active policy with correct fields
- Uppercases flight number
- Policy is retrievable via `get()`

**`PolicyStore.markPaidOut`:** Sets `status: 'paid_out'` and `payoutTxHash`

**`PolicyStore.markExpired`:** Sets `status: 'expired'`

**`PolicyStore.getActive`:** Returns only `status: 'active'` policies

**`PolicyStore.countByStatus`:** Counts correctly across all status values

**`PolicyStore.cleanup`:**
- Removes expired policies older than TTL
- Does not remove recently expired policies
- Does not remove active policies regardless of age

---

## Contract Test Coverage

All contract tests are in `test/FlightGuard.test.js` and cover `contracts/FlightGuard.sol`:

| Function | Happy Path | Error Cases |
|---|---|---|
| `constructor` | owner set, USDC address set | zero USDC address reverts |
| `fund()` | pool balance increases, `PoolFunded` event emitted | zero amount reverts |
| `registerPolicy()` | policy stored, `PolicyRegistered` event emitted | not owner, duplicate id, insufficient pool, zero payout amount, zero payout address |
| `triggerPayout()` | USDC transferred to policyholder, `PayoutTriggered` event, status = PaidOut | double payout, policy not found, not owner |
| `expirePolicy()` | status = Expired, `PolicyExpired` event emitted | already paid out |
| `withdraw()` | USDC sent to owner address | not owner |

---

## Contract Test Patterns

**Structure:**
```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("FlightGuard", function () {
  async function deployFixture() {
    const [owner, funder, policyholder, stranger] = await ethers.getSigners();
    // ... deploy contracts, mint tokens, fund pool ...
    return { fg, usdc, owner, funder, policyholder, stranger };
  }
  // test suites...
});
```

**Key helpers:**
```javascript
function uuidToBytes32(uuid) {
  return ethers.keccak256(ethers.toUtf8Bytes(uuid));
}
const USDC = (n) => ethers.parseUnits(String(n), 6);
```

**Patterns:** `loadFixture` for state isolation, `function(){}` (not arrow functions), per-function `describe` blocks.

---

## What Is Not Tested

| Module | Gap | Notes |
|---|---|---|
| `src/server.ts` | HTTP routes, MPP payment flow | Would require mocking `mppx` or a real Tempo account |
| `src/checker.ts` | Full cycle orchestration | Requires mocking AeroDataBox and Tempo RPC |
| `src/payout.ts` | viem ERC-20 transfer | Requires a funded Tempo wallet or fork |
| `src/flight.ts` | `fetchFlightInfo()` (HTTP) | Requires mocking `fetch` — pure helpers are fully tested |

---

## Test Isolation: PolicyStore

`PolicyStore` accepts an optional `storePath` constructor argument:
```typescript
export class PolicyStore {
  constructor(storePath?: string) {
    this.storePath = storePath ?? DEFAULT_STORE_PATH
    this.policies = loadFromDisk(this.storePath)
  }
}
```

Pass a non-existent path in tests to get a fresh, non-persistent store:
```typescript
const store = new PolicyStore('/dev/null/nonexistent.json')
```

The production singleton uses `DEFAULT_STORE_PATH` (`policies.json` or `$STORE_PATH`).
