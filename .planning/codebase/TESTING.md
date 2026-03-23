# Testing Patterns

**Analysis Date:** 2026-03-23

## Test Framework

**Runner:**
- Hardhat (via `@nomicfoundation/hardhat-toolbox` ^5.0.0) — runs Mocha under the hood
- Config: `hardhat.config.js`
- Hardhat network (local in-memory EVM) used for all contract tests

**Assertion Library:**
- Chai (bundled with hardhat-toolbox) — `expect` style
- `@nomicfoundation/hardhat-chai-matchers` — adds `.to.emit()`, `.to.be.revertedWith()`, `.to.be.revertedWithCustomError()`

**Run Commands:**
```bash
npm run test:contracts             # Run all Hardhat/Mocha contract tests
npx hardhat test                   # Same, direct hardhat invocation
REPORT_GAS=true npm run test:contracts  # Run with gas cost reporter
```

**Note:** There is no JavaScript/TypeScript unit test framework (Jest, Vitest, etc.) configured. The TypeScript server-side code in `src/` has no test coverage. Only the Solidity smart contract layer is tested.

## Test File Organization

**Location:**
- Separate `test/` directory at project root — not co-located with source

**Naming:**
- `<ContractName>.test.js` — e.g., `test/FlightGuard.test.js`
- Written in CommonJS JavaScript (not TypeScript)

**Structure:**
```
test/
└── FlightGuard.test.js    # All contract tests (247 lines)
```

## Test Structure

**Suite Organization:**
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

  describe("Deployment", function () {
    it("sets the deployer as owner", async function () {
      const { fg, owner } = await loadFixture(deployFixture);
      expect(await fg.owner()).to.equal(owner.address);
    });
  });

  describe("fund()", function () { /* ... */ });
  describe("registerPolicy()", function () { /* ... */ });
  describe("triggerPayout()", function () { /* ... */ });
  describe("expirePolicy()", function () { /* ... */ });
  describe("withdraw()", function () { /* ... */ });
});
```

**Patterns:**
- Each `describe` block maps to one contract function
- Each `it` block tests a single behaviour (happy path or error case)
- All `it` and `describe` callbacks use `function () {}` — never arrow functions (Mocha `this` context)
- Each test calls `await loadFixture(deployFixture)` to get a fresh EVM snapshot
- `loadFixture` is preferred over `beforeEach` for state isolation and performance

## Fixture Pattern

The entire test suite uses a single shared fixture defined at the top of the `describe` block:

```javascript
async function deployFixture() {
  const [owner, funder, policyholder, stranger] = await ethers.getSigners();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

  const FlightGuard = await ethers.getContractFactory("FlightGuard");
  const fg = await FlightGuard.deploy(await usdc.getAddress());

  await usdc.mint(funder.address, USDC(1000));
  await usdc.connect(funder).approve(await fg.getAddress(), USDC(1000));
  await fg.connect(funder).fund(USDC(100));

  return { fg, usdc, owner, funder, policyholder, stranger };
}
```

Nested helpers for compound state (e.g., policy already registered) are defined as inner async functions within their `describe` block:

```javascript
async function withActivePolicy(fixture) {
  const { fg, owner, policyholder } = fixture;
  const pid = uuidToBytes32("flight-001");
  await fg.connect(owner).registerPolicy(pid, policyholder.address, USDC(5));
  return pid;
}
// Usage:
const ctx = await loadFixture(deployFixture);
const pid = await withActivePolicy(ctx);
```

## Test Helpers

Two module-level helpers are defined at the top of `test/FlightGuard.test.js`:

```javascript
// Reproduces the server-side policyId derivation (mirrors src/store.ts logic)
function uuidToBytes32(uuid) {
  return ethers.keccak256(ethers.toUtf8Bytes(uuid));
}

// Converts human-readable USDC amounts to 6-decimal uint256
const USDC = (n) => ethers.parseUnits(String(n), 6);
```

Always use `uuidToBytes32` when creating policy IDs in tests — it mirrors the production off-chain logic.

## Mocking

**Framework:** `contracts/MockERC20.sol` — an on-chain mock (not a JS mock library)

```solidity
contract MockERC20 is ERC20 {
    // Only used in tests — not deployed to mainnet
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
```

- `MockERC20` is deployed fresh per fixture and provides `mint()` for funding test wallets
- All EVM interactions use Hardhat's in-memory network — no external RPC calls during tests
- No JavaScript-level mocking (no `jest.mock`, `sinon`, etc.) — none needed for contract tests
- External API dependencies (AeroDataBox, MPP) are not mocked anywhere because the TypeScript server layer has no tests

**What to mock (for new contract tests):**
- Use `contracts/MockERC20.sol` for any ERC-20 token dependency — it already exists
- Deploy contracts fresh via `deployFixture` — never share state across tests

**What NOT to mock:**
- Do not mock `ethers.getSigners()` — use Hardhat's built-in signer pool
- Do not mock contract calls — interact with actual deployed contracts on the local Hardhat network

## Assertion Patterns

**Event assertion:**
```javascript
await expect(fg.connect(owner).triggerPayout(pid))
  .to.emit(fg, "PayoutTriggered")
  .withArgs(pid, policyholder.address, USDC(5));
```

**Revert with string message:**
```javascript
await expect(fg.fund(0)).to.be.revertedWith("Amount must be > 0");
```

**Revert with OpenZeppelin custom error:**
```javascript
await expect(
  fg.connect(stranger).withdraw(USDC(1))
).to.be.revertedWithCustomError(fg, "OwnableUnauthorizedAccount");
```

**Balance / state assertion:**
```javascript
const before = await usdc.balanceOf(policyholder.address);
await fg.connect(owner).triggerPayout(pid);
expect(await usdc.balanceOf(policyholder.address)).to.equal(before + USDC(5));
```

**Enum status assertion** — compare against raw integer values:
```javascript
expect(policy.status).to.equal(0); // Active
expect(policy.status).to.equal(1); // PaidOut
expect(policy.status).to.equal(2); // Expired
```

## Coverage

**Requirements:** None enforced — no coverage configuration present.

**Gas Reporting:**
```bash
REPORT_GAS=true npm run test:contracts
```
Enabled via `hardhat.config.js` `gasReporter` config when `REPORT_GAS=true` env var is set.

## Test Types

**Contract Tests (the only tests that exist):**
- Scope: Solidity smart contract behaviour for `contracts/FlightGuard.sol`
- Framework: Hardhat + Mocha + Chai
- Network: Hardhat in-memory EVM (no external network required)
- Location: `test/FlightGuard.test.js`

**TypeScript Server Tests:**
- Not present. `src/server.ts`, `src/checker.ts`, `src/payout.ts`, `src/store.ts` have zero test coverage.

**Integration Tests:**
- Not present.

**E2E Tests:**
- Not present. Manual testing documented in `README.md` using `curl` and the `mppx` CLI.

## What Is Tested

All tests are in `test/FlightGuard.test.js` and cover `contracts/FlightGuard.sol`:

| Function | Happy Path | Error Cases |
|---|---|---|
| `constructor` | owner set, USDC address set | zero USDC address reverts |
| `fund()` | pool balance increases, `PoolFunded` event emitted | zero amount reverts |
| `registerPolicy()` | policy stored, `PolicyRegistered` event emitted | not owner, duplicate id, insufficient pool, zero payout amount, zero payout address |
| `triggerPayout()` | USDC transferred to policyholder, `PayoutTriggered` event, status = PaidOut | double payout, policy not found, not owner |
| `expirePolicy()` | status = Expired, `PolicyExpired` event emitted | already paid out |
| `withdraw()` | USDC sent to owner address | not owner |

## What Is Not Tested

- `src/server.ts` — HTTP routes and MPP payment verification logic
- `src/checker.ts` — flight polling loop and delay threshold evaluation
- `src/payout.ts` — viem-based pathUSD transfer engine
- `src/store.ts` — in-memory policy store CRUD operations
- `src/flight.ts` — AeroDataBox API wrapper (referenced in `README.md` architecture but file not found in `src/`)

---

*Testing analysis: 2026-03-23*
