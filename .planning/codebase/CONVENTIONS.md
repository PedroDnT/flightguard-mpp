# Coding Conventions

**Analysis Date:** 2026-03-21

## Naming Patterns

**Files:**
- Lowercase with hyphens for multi-word names
- Examples: `checker.ts`, `payout.ts`, `flight.ts`, `store.ts`, `server.ts`, `types.ts`
- All TypeScript files end with `.ts`

**Functions:**
- camelCase for all functions
- Examples: `fetchFlightInfo()`, `getDepartureDelayMinutes()`, `hasFlightDeparted()`, `sendPayout()`
- Verb-first pattern for action functions: `fetch*`, `get*`, `build*`, `send*`, `mark*`, `create*`
- Predicate functions use `is*` or `has*`: `isFlightTerminal()`, `hasFlightDeparted()`

**Variables:**
- camelCase throughout
- Constants use UPPER_SNAKE_CASE (e.g., `PATHUSD_DECIMALS`, `AERODATABOX_BASE_URL`, `TEMPO_TESTNET`)
- Private class members prefixed with underscore: `private intervalHandle: ReturnType<typeof setInterval> | null = null`

**Types:**
- PascalCase for all interfaces and types
- Examples: `Policy`, `FlightInfo`, `AppConfig`, `PayoutRequest`, `FlightChecker`, `PolicyStore`
- Union types are PascalCase: `FlightStatus`, `PolicyStatus`

**Classes:**
- PascalCase (e.g., `FlightChecker`, `PolicyStore`, `PayoutEngine`)
- Private methods with underscore prefix: `private runCycle()`, `private checkPolicy()`
- Constructor parameters become private instance variables: `constructor(config: AppConfig) { this.config = config }`

## Code Style

**Formatting:**
- No explicit formatter configured (no .prettierrc, eslint, or biome.json files found)
- Indentation: 2 spaces (consistent throughout codebase)
- Line length: ~80-100 characters observed
- Trailing commas in function calls and object literals

**Linting:**
- No explicit linter configured
- No .eslintrc or equivalent found
- Strict TypeScript enabled in `tsconfig.json`: `"strict": true`
- Type safety enforced through TypeScript compiler (`"noEmit"` in typecheck script)

**Comments and Documentation:**
- Block comments with separator lines for section headers:
  ```typescript
  // ============================================================
  // FlightGuard MPP — Flight Checker Cron
  // Polls active policies, triggers payouts automatically
  // ============================================================
  ```
- JSDoc-style comments for public methods:
  ```typescript
  /**
   * Start the checker loop.
   */
  start(): void { ... }
  ```
- Inline comments with leading dashes for visual separation:
  ```typescript
  // ── Load and validate config ─────────────────────────────────
  ```

## Import Organization

**Order:**
1. Standard library imports (`crypto`, `dotenv`)
2. Third-party framework imports (`hono`, `viem`, `mppx`)
3. Type imports from third-party libraries (`type` keyword)
4. Local module imports (relative paths with `.js` extension)
5. Local type imports (`type` keyword for local modules)

**Example from `src/payout.ts`:**
```typescript
import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
  defineChain,
  type Address,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  PATHUSD_DECIMALS,
  type PayoutRequest,
  type PayoutResult,
  type AppConfig,
} from './types.js'
```

**Path Aliases:**
- No path aliases configured in `tsconfig.json`
- All imports use relative paths with explicit `.js` extension for ES modules

**Type Imports:**
- `type` keyword used to distinguish type imports from value imports
- Type imports grouped with related value imports from same module

## Error Handling

**Patterns:**
- Try-catch blocks for async operations that may fail
- Graceful null returns for optional results
- Error messages logged with context prefix (`[CHECKER]`, `[PAYOUT]`, `[FLIGHT]`, `[SERVER]`, `[STORE]`)

**Example from `src/checker.ts` lines 79-86:**
```typescript
for (const policy of active) {
  try {
    const result = await this.checkPolicy(policy.id)
    if (result) results.push(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[CHECKER] Error checking policy ${policy.id}: ${msg}`)
  }
}
```

**Error Response Pattern from `src/server.ts`:**
- HTTP endpoints return structured error objects with `error` field and appropriate status codes
- Missing fields return 400 Bad Request
- Not found returns 404 Not Found
- Service unavailable returns 503 Service Unavailable

**Result Objects:**
- Methods that may fail return interface objects with `success` boolean and optional `error` field
- Example: `PayoutResult { success: boolean, txHash?: string, error?: string }`

## Logging

**Framework:** console (built-in)

**Patterns:**
- Context prefix in brackets: `[CHECKER]`, `[PAYOUT]`, `[FLIGHT]`, `[SERVER]`, `[STORE]`
- Indented sub-logs use two spaces within context
- Summary logs use separator lines with dashes for major operations
- Emoji indicators for terminal states: ✅ success, ❌ failure, → direction/action

**Log Levels:**
- `console.log()` for informational messages
- `console.warn()` for warnings (rare, used when already running in `src/checker.ts`)
- `console.error()` for errors

**Examples:**
```typescript
console.log(`[CHECKER] Checking policy ${policyId}`)
console.log(`[CHECKER]   Flight: ${policy.flightNumber} on ${policy.date}`)
console.error(`[CHECKER] Error checking policy ${policy.id}: ${msg}`)
console.log(`[PAYOUT] Amount in units: ${amountUnits.toString()}`)
```

## Module Design

**Exports:**
- Singleton pattern for global stores: `export const store = new PolicyStore()` in `src/store.ts`
- Class exports for services that need configuration: `export class FlightChecker` in `src/checker.ts`
- Helper function exports for utilities: `export async function fetchFlightInfo()` in `src/flight.ts`
- Type exports for all public interfaces: `export type Policy`, `export interface AppConfig`

**No Barrel Files:**
- Each file exports directly from source, no index.ts re-exports
- Imports use explicit file paths: `import { store } from './store.js'`

**Private Implementation Details:**
- Internal type interfaces marked with comments: `// ─ INTERNAL: raw AeroDataBox response shape (partial)` in `src/flight.ts`
- Helper functions not marked private but conceptually internal through naming and comments

## Function Design

**Size:**
- Methods 10-50 lines common
- Longer methods broken into private helper methods within class
- Example: `checkPolicy()` is 109 lines with clear case statements and helper functions

**Parameters:**
- Explicit typed parameters, no object spread where unnecessary
- Classes accept config object in constructor: `constructor(config: AppConfig)`
- Methods accept result/request objects: `sendPayout(req: PayoutRequest): Promise<PayoutResult>`
- Helper functions accept multiple simple parameters: `fetchFlightInfo(flightNumber: string, date: string, rapidApiKey: string)`

**Return Values:**
- Async functions return Promises with clear result types
- Functions may return `undefined` for optional/not-found cases
- Helper functions return normalized/transformed data types
- Result objects for operations that may fail: `{ success: boolean, error?: string, txHash?: string }`

**Async/Await:**
- Preferred over `.then()` chains
- All event-driven operations use `async`/`await`
- Exception handling with try-catch

## Type Safety

**Strict Mode:**
- TypeScript strict mode enabled
- All function parameters typed
- All return types explicitly annotated
- No implicit `any` types

**Branded Types:**
- Viem address type used for wallet addresses: `Address` from viem
- String literals for app-specific enums: `PolicyStatus = 'active' | 'paid_out' | 'expired' | 'cancelled'`
- Hex string literals for private keys and addresses: `poolPrivateKey: \`0x${string}\``

**Constants:**
- Configuration values loaded from environment with defaults
- Magic numbers extracted to named constants
- Example: `PATHUSD_DECIMALS = 6` in `src/types.ts`

---

*Convention analysis: 2026-03-21*
