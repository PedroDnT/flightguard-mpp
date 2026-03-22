---
name: gen-test
description: Generate vitest unit and integration tests for FlightGuard MPP source files. Covers pure data transformations, HTTP endpoints, and known bugs.
---

Generate vitest tests for the file(s) or module specified in $ARGUMENTS.

## Project Test Setup

If `vitest` is not yet installed, add it first:
```bash
npm install -D vitest @types/supertest supertest
```

Add to `package.json` scripts:
```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

## Testing Priorities (in order)

### 1. `src/flight.ts` — Pure data transformations (start here)
- `normalizeFlightInfo()` — test with fixtures of raw AeroDataBox responses
- **KNOWN BUG regression test**: `arrival.actualTime` at lines 121-125 was reading from `scheduledTime` fields instead of `actualTime`. Write a regression test: provide a raw flight where `arrival.actualTime` differs from `arrival.scheduledTime` and assert the normalized result uses `actualTime` values.
- `getDepartureDelayMinutes()`, `hasFlightDeparted()`, `isFlightTerminal()`, `getScheduledDepartureUtc()`

### 2. `src/store.ts` — In-memory store CRUD (no mocks needed)
- Create, get, update, list policies
- Filter by status

### 3. `src/checker.ts` — Policy evaluation logic
- Mock `fetchFlightInfo` with `vi.mock('../flight.js')`
- Test delay threshold boundary conditions (59 min → no payout, 60 min → payout)
- Test expired policy handling

### 4. HTTP endpoints via supertest
- `POST /insure` — valid and invalid inputs
- `GET /policy/:id` — found and not found
- `GET /health` — response shape

## Mocking Patterns

```typescript
import { vi } from 'vitest'

// Mock AeroDataBox HTTP calls
vi.mock('../flight.js', () => ({
  fetchFlightInfo: vi.fn(),
}))

// Mock viem for payout tests
vi.mock('viem', () => ({
  createWalletClient: vi.fn(() => ({ writeContract: vi.fn() })),
  createPublicClient: vi.fn(() => ({ readContract: vi.fn() })),
}))
```

## AeroDataBox Fixture Template

```typescript
const rawFlight = {
  number: 'AA123',
  status: 'Landed',
  departure: {
    scheduledTime: { local: '2026-03-21T10:00:00', utc: '2026-03-21T15:00:00Z' },
    actualTime: { local: '2026-03-21T11:05:00', utc: '2026-03-21T16:05:00Z' },
    delays: [{ minutes: 65, reason: 'Weather' }],
    airport: { iata: 'JFK', name: 'John F. Kennedy' },
  },
  arrival: {
    scheduledTime: { local: '2026-03-21T14:00:00', utc: '2026-03-21T19:00:00Z' },
    actualTime: { local: '2026-03-21T15:10:00', utc: '2026-03-21T20:10:00Z' },
    airport: { iata: 'LAX', name: 'Los Angeles International' },
  },
}
```
