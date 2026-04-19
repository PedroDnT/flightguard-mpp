import { AERODATABOX_BASE_URL, type AppConfig } from "../config/types.js";
import { createLogger } from "../shared/logger.js";

export interface FlightDelay {
  minutes: number;
  reason?: string;
}

export interface FlightAirport {
  iata: string;
  name: string;
  scheduledTime?: {
    local: string;
    utc: string;
  };
  actualTime?: {
    local: string;
    utc: string;
  };
  delays?: FlightDelay[];
  terminal?: string;
}

export type FlightStatus =
  | "Scheduled"
  | "Departed"
  | "EnRoute"
  | "Landed"
  | "Arrived"
  | "Cancelled"
  | "Diverted"
  | "Unknown";

export interface FlightInfo {
  number: string;
  status: FlightStatus;
  departure: FlightAirport;
  arrival: FlightAirport;
  airline?: {
    name: string;
    iata?: string;
  };
}

interface AeroDataBoxFlight {
  number?: string;
  status?: string;
  departure?: {
    scheduledTime?: { local?: string; utc?: string };
    actualTime?: { local?: string; utc?: string };
    delays?: Array<{ minutes?: number; reason?: string }>;
    airport?: { iata?: string; name?: string };
    terminal?: string;
  };
  arrival?: {
    scheduledTime?: { local?: string; utc?: string };
    actualTime?: { local?: string; utc?: string };
    airport?: { iata?: string; name?: string };
  };
  airline?: { name?: string; iata?: string };
}

const log = createLogger("FLIGHT");
const FLIGHT_CACHE_TTL_MS = 4 * 60 * 1000;
const flightCache = new Map<
  string,
  { data: FlightInfo | null; fetchedAt: number }
>();

function getCached(key: string): FlightInfo | null | undefined {
  const entry = flightCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.fetchedAt > FLIGHT_CACHE_TTL_MS) {
    flightCache.delete(key);
    return undefined;
  }
  return entry.data;
}

export async function fetchFlightInfo(
  flightNumber: string,
  date: string,
  rapidApiKey: string,
): Promise<FlightInfo | null> {
  const cacheKey = `${flightNumber}:${date}`;

  const cached = getCached(cacheKey);
  if (cached !== undefined) {
    log.log(`Cache hit for ${flightNumber} on ${date}`);
    return cached;
  }

  const url = `${AERODATABOX_BASE_URL}/flights/number/${encodeURIComponent(flightNumber)}/${date}`;

  log.log(`Fetching flight ${flightNumber} on ${date}`);
  log.log(`URL: ${url}`);

  const response = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": rapidApiKey,
      "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com",
    },
  });

  if (response.status === 404) {
    log.log(`Flight ${flightNumber} not found (404)`);
    flightCache.set(cacheKey, { data: null, fetchedAt: Date.now() });
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `AeroDataBox API error: ${response.status} ${response.statusText} — ${body}`,
    );
  }

  const data = (await response.json()) as AeroDataBoxFlight[];

  if (!Array.isArray(data) || data.length === 0) {
    log.log(`No data returned for ${flightNumber} on ${date}`);
    flightCache.set(cacheKey, { data: null, fetchedAt: Date.now() });
    return null;
  }

  const result = normalizeFlightInfo(data[0]);
  flightCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
  return result;
}

function normalizeFlightInfo(raw: AeroDataBoxFlight): FlightInfo {
  const status = normalizeStatus(raw.status);

  const departure = {
    iata: raw.departure?.airport?.iata ?? "UNK",
    name: raw.departure?.airport?.name ?? "Unknown",
    scheduledTime: raw.departure?.scheduledTime
      ? {
          local: raw.departure.scheduledTime.local ?? "",
          utc: raw.departure.scheduledTime.utc ?? "",
        }
      : undefined,
    actualTime: raw.departure?.actualTime
      ? {
          local: raw.departure.actualTime.local ?? "",
          utc: raw.departure.actualTime.utc ?? "",
        }
      : undefined,
    delays: (raw.departure?.delays ?? []).map((d) => ({
      minutes: d.minutes ?? 0,
      reason: d.reason,
    })),
    terminal: raw.departure?.terminal,
  };

  const arrival = {
    iata: raw.arrival?.airport?.iata ?? "UNK",
    name: raw.arrival?.airport?.name ?? "Unknown",
    scheduledTime: raw.arrival?.scheduledTime
      ? {
          local: raw.arrival.scheduledTime.local ?? "",
          utc: raw.arrival.scheduledTime.utc ?? "",
        }
      : undefined,
    actualTime: raw.arrival?.actualTime
      ? {
          local: raw.arrival.actualTime.local ?? "",
          utc: raw.arrival.actualTime.utc ?? "",
        }
      : undefined,
  };

  return {
    number: raw.number ?? "",
    status,
    departure,
    arrival,
    airline: raw.airline
      ? { name: raw.airline.name ?? "", iata: raw.airline.iata }
      : undefined,
  };
}

function normalizeStatus(raw?: string): FlightStatus {
  const map: Record<string, FlightStatus> = {
    Scheduled: "Scheduled",
    Departed: "Departed",
    EnRoute: "EnRoute",
    Landed: "Landed",
    Arrived: "Arrived",
    Cancelled: "Cancelled",
    Diverted: "Diverted",
  };
  return raw && map[raw] ? map[raw] : "Unknown";
}

export function getDepartureDelayMinutes(flight: FlightInfo): number {
  const delays = flight.departure.delays;
  if (!delays || delays.length === 0) return 0;
  return delays[0].minutes ?? 0;
}

export function hasFlightDeparted(flight: FlightInfo): boolean {
  return ["Departed", "EnRoute", "Landed", "Arrived"].includes(flight.status);
}

export function isFlightTerminal(flight: FlightInfo): boolean {
  return ["Landed", "Arrived", "Cancelled", "Diverted"].includes(flight.status);
}

export function getScheduledDepartureUtc(flight: FlightInfo): string {
  return flight.departure.scheduledTime?.utc ?? "";
}
