# Testing — FlightGuard MPP

## Current State

**Zero application tests exist.** There are no test files in `src/` or anywhere outside `node_modules/`. This is a greenfield codebase with no test infrastructure set up.

## Test Framework

- **Framework:** None configured
- **Test runner:** None (`package.json` has no `test` script beyond a placeholder)
- **Coverage tooling:** None
- **CI test gate:** None

## What Exists

Only node_modules test files from dependencies (e.g., `zod`, `fast-uri`, `@readme/better-ajv-errors`). None of these are application tests.

## Key Areas Lacking Tests

### Unit Tests (missing)
- `src/flight.ts` — AeroDataBox response parsing and mapping logic
- `src/payout.ts` — Tempo chain payout execution
- `src/checker.ts` — Policy evaluation and delay threshold logic
- `src/store.ts` — In-memory policy store CRUD operations
- `src/config.ts` — Environment variable parsing and validation

### Integration Tests (missing)
- `POST /insure` endpoint — full policy creation flow
- `GET /policy/:id` endpoint — policy retrieval with live flight status
- `GET /health` endpoint — health check response
- AeroDataBox API client integration
- Tempo blockchain payout integration

### E2E Tests (missing)
- Full insurance purchase → flight delay → payout flow
- Policy expiry flow (no delay)

## Known Testable Bugs

- **`src/flight.ts:122-125`** — `arrival.actualTime` incorrectly reads from `scheduledTime` fields instead of `actualTime`. Confirmed bug that a unit test would catch.

## Testing Infrastructure Needed

To add tests, the following would be required:

```json
// Suggested devDependencies
{
  "vitest": "^2.x",       // or jest
  "@types/supertest": "*", // for HTTP endpoint testing
  "supertest": "*"
}
```

Suggested `package.json` scripts:
```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

## Mocking Patterns (recommended)

Given the architecture, tests would need to mock:
- **AeroDataBox API** — HTTP mock via `msw` or `nock`
- **Tempo RPC** — `viem` transport mock
- **PolicyStore** — can be tested directly (in-memory, no external deps)
- **Config** — inject via environment variables in test setup

## Recommendations

1. Add `vitest` — works natively with TypeScript/ESM, no config needed
2. Start with unit tests for `src/flight.ts` (pure data transformation, easy to test)
3. Add integration tests for HTTP routes using `supertest`
4. Set up a CI step to run tests on push
