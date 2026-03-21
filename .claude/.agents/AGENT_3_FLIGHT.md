# AGENT 3 — Flight Data Wrapper (src/flight.ts)

## Your Role
Write `src/flight.ts`. This module wraps the AeroDataBox API. It is the only file that talks to the external flight API. All other modules call these functions — never the API directly.

---

## Dependencies (already installed by Agent 1)
- `node-fetch` v3 (ESM)
- Types from `src/types.ts`

---

## File: src/flight.ts

```ts
// ============================================================
// FlightGuard MPP — AeroDataBox Flight Data Wrapper
// ============================================================

import {
  AERODATABOX_BASE_URL,
  type FlightInfo,
  type FlightStatus,
} from './types.js'

// ------------------------------------------------------------
// INTERNAL: raw AeroDataBox response shape (partial)
// ------------------------------------------------------------

interface AeroDataBoxFlight {
  number?: string
  status?: string
  departure?: {
    scheduledTime?: { local?: string; utc?: string }
    actualTime?: { local?: string; utc?: string }
    delays?: Array<{ minutes?: number; reason?: string }>
    airport?: { iata?: string; name?: string }
    terminal?: string
  }
  arrival?: {
    scheduledTime?: { local?: string; utc?: string }
    actualTime?: { local?: string; utc?: string }
    airport?: { iata?: string; name?: string }
  }
  airline?: { name?: string; iata?: string }
}

// ------------------------------------------------------------
// MAIN: fetch flight info
// ------------------------------------------------------------

/**
 * Fetch flight information from AeroDataBox.
 * Returns null if the flight is not found (404) or data is unavailable.
 * Throws on network/auth errors.
 */
export async function fetchFlightInfo(
  flightNumber: string,
  date: string,  // "YYYY-MM-DD"
  rapidApiKey: string,
): Promise<FlightInfo | null> {
  const url = `${AERODATABOX_BASE_URL}/flights/number/${encodeURIComponent(flightNumber)}/${date}`

  console.log(`[FLIGHT] Fetching flight ${flightNumber} on ${date}`)
  console.log(`[FLIGHT] URL: ${url}`)

  const response = await fetch(url, {
    headers: {
      'X-RapidAPI-Key': rapidApiKey,
      'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
    },
  })

  if (response.status === 404) {
    console.log(`[FLIGHT] Flight ${flightNumber} not found (404)`)
    return null
  }

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `[FLIGHT] AeroDataBox API error: ${response.status} ${response.statusText} — ${body}`,
    )
  }

  const data = await response.json() as AeroDataBoxFlight[]

  if (!Array.isArray(data) || data.length === 0) {
    console.log(`[FLIGHT] No data returned for ${flightNumber} on ${date}`)
    return null
  }

  // AeroDataBox returns an array; use the first match
  const raw = data[0]
  return normalizeFlightInfo(raw)
}

// ------------------------------------------------------------
// HELPER: normalize raw API response to our FlightInfo type
// ------------------------------------------------------------

function normalizeFlightInfo(raw: AeroDataBoxFlight): FlightInfo {
  const status = normalizeStatus(raw.status)

  const departure = {
    iata: raw.departure?.airport?.iata ?? 'UNK',
    name: raw.departure?.airport?.name ?? 'Unknown',
    scheduledTime: raw.departure?.scheduledTime
      ? {
          local: raw.departure.scheduledTime.local ?? '',
          utc: raw.departure.scheduledTime.utc ?? '',
        }
      : undefined,
    actualTime: raw.departure?.actualTime
      ? {
          local: raw.departure.actualTime.local ?? '',
          utc: raw.departure.actualTime.utc ?? '',
        }
      : undefined,
    delays: (raw.departure?.delays ?? []).map((d) => ({
      minutes: d.minutes ?? 0,
      reason: d.reason,
    })),
    terminal: raw.departure?.terminal,
  }

  const arrival = {
    iata: raw.arrival?.airport?.iata ?? 'UNK',
    name: raw.arrival?.airport?.name ?? 'Unknown',
    scheduledTime: raw.arrival?.scheduledTime
      ? {
          local: raw.arrival.scheduledTime.local ?? '',
          utc: raw.arrival.scheduledTime.utc ?? '',
        }
      : undefined,
    actualTime: raw.arrival?.actualTime
      ? {
          local: raw.arrival.scheduledTime?.local ?? '',
          utc: raw.arrival.scheduledTime?.utc ?? '',
        }
      : undefined,
  }

  return {
    number: raw.number ?? '',
    status,
    departure,
    arrival,
    airline: raw.airline
      ? { name: raw.airline.name ?? '', iata: raw.airline.iata }
      : undefined,
  }
}

function normalizeStatus(raw?: string): FlightStatus {
  const map: Record<string, FlightStatus> = {
    Scheduled: 'Scheduled',
    Departed: 'Departed',
    EnRoute: 'EnRoute',
    Landed: 'Landed',
    Arrived: 'Arrived',
    Cancelled: 'Cancelled',
    Diverted: 'Diverted',
  }
  return (raw && map[raw]) ? map[raw] : 'Unknown'
}

// ------------------------------------------------------------
// HELPER: extract delay minutes from FlightInfo
// ------------------------------------------------------------

/**
 * Returns the departure delay in minutes.
 * Returns 0 if no delay information is available.
 */
export function getDepartureDelayMinutes(flight: FlightInfo): number {
  const delays = flight.departure.delays
  if (!delays || delays.length === 0) return 0
  return delays[0].minutes ?? 0
}

/**
 * Returns true if the flight has departed (or landed/arrived).
 */
export function hasFlightDeparted(flight: FlightInfo): boolean {
  return ['Departed', 'EnRoute', 'Landed', 'Arrived'].includes(flight.status)
}

/**
 * Returns true if the flight is in a terminal state
 * (no more status changes expected).
 */
export function isFlightTerminal(flight: FlightInfo): boolean {
  return ['Landed', 'Arrived', 'Cancelled', 'Diverted'].includes(flight.status)
}

/**
 * Returns the scheduled departure UTC string, or empty string if unavailable.
 */
export function getScheduledDepartureUtc(flight: FlightInfo): string {
  return flight.departure.scheduledTime?.utc ?? ''
}
```

---

## Testing (manual, in terminal)

Create a quick test file `test-flight.ts`:

```ts
import 'dotenv/config'
import { fetchFlightInfo, getDepartureDelayMinutes } from './src/flight.js'

const info = await fetchFlightInfo('LA3251', '2026-03-19', process.env.RAPIDAPI_KEY!)
console.log(JSON.stringify(info, null, 2))
if (info) console.log('Delay:', getDepartureDelayMinutes(info), 'min')
```

Run: `npx tsx test-flight.ts`

Expected: JSON output with flight info, or `null` if flight not found.

---

## Completion Checklist

- [ ] `src/flight.ts` written
- [ ] Handles 404 gracefully (returns null)
- [ ] Throws on auth/network errors
- [ ] `getDepartureDelayMinutes` exported
- [ ] `hasFlightDeparted` exported
- [ ] `isFlightTerminal` exported
- [ ] `getScheduledDepartureUtc` exported
- [ ] `npx tsc --noEmit` passes
