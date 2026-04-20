import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getDepartureDelayMinutes,
  hasFlightDeparted,
  isFlightTerminal,
  getScheduledDepartureUtc,
  fetchFlightInfo,
} from "../src/integrations/aerodatabox.js";
import type { FlightInfo } from "../src/integrations/aerodatabox.js";

function makeFlightInfo(overrides: Partial<FlightInfo> = {}): FlightInfo {
  return {
    number: "LA3251",
    status: "Scheduled",
    departure: {
      iata: "GRU",
      name: "Guarulhos",
      delays: [],
    },
    arrival: {
      iata: "GIG",
      name: "Galeão",
    },
    ...overrides,
  };
}

describe("getDepartureDelayMinutes", () => {
  it("returns 0 when no delays", () => {
    expect(getDepartureDelayMinutes(makeFlightInfo())).toBe(0);
  });

  it("returns first delay minutes", () => {
    const f = makeFlightInfo({
      departure: { iata: "GRU", name: "GRU", delays: [{ minutes: 75 }] },
    });
    expect(getDepartureDelayMinutes(f)).toBe(75);
  });

  it("returns 0 when delays array is empty", () => {
    const f = makeFlightInfo({
      departure: { iata: "GRU", name: "GRU", delays: [] },
    });
    expect(getDepartureDelayMinutes(f)).toBe(0);
  });

  it("returns 0 when delays is undefined", () => {
    const f = makeFlightInfo({
      departure: { iata: "GRU", name: "GRU" },
    });
    expect(getDepartureDelayMinutes(f)).toBe(0);
  });
});

describe("hasFlightDeparted", () => {
  it("returns false for Scheduled", () => {
    expect(hasFlightDeparted(makeFlightInfo({ status: "Scheduled" }))).toBe(
      false,
    );
  });

  it("returns false for Unknown", () => {
    expect(hasFlightDeparted(makeFlightInfo({ status: "Unknown" }))).toBe(
      false,
    );
  });

  it("returns true for Departed", () => {
    expect(hasFlightDeparted(makeFlightInfo({ status: "Departed" }))).toBe(
      true,
    );
  });

  it("returns true for EnRoute", () => {
    expect(hasFlightDeparted(makeFlightInfo({ status: "EnRoute" }))).toBe(true);
  });

  it("returns true for Landed", () => {
    expect(hasFlightDeparted(makeFlightInfo({ status: "Landed" }))).toBe(true);
  });

  it("returns true for Arrived", () => {
    expect(hasFlightDeparted(makeFlightInfo({ status: "Arrived" }))).toBe(true);
  });

  it("returns false for Cancelled", () => {
    expect(hasFlightDeparted(makeFlightInfo({ status: "Cancelled" }))).toBe(
      false,
    );
  });
});

describe("isFlightTerminal", () => {
  it("returns false for Scheduled", () => {
    expect(isFlightTerminal(makeFlightInfo({ status: "Scheduled" }))).toBe(
      false,
    );
  });

  it("returns false for Departed", () => {
    expect(isFlightTerminal(makeFlightInfo({ status: "Departed" }))).toBe(
      false,
    );
  });

  it("returns false for EnRoute", () => {
    expect(isFlightTerminal(makeFlightInfo({ status: "EnRoute" }))).toBe(false);
  });

  it("returns true for Landed", () => {
    expect(isFlightTerminal(makeFlightInfo({ status: "Landed" }))).toBe(true);
  });

  it("returns true for Arrived", () => {
    expect(isFlightTerminal(makeFlightInfo({ status: "Arrived" }))).toBe(true);
  });

  it("returns true for Cancelled", () => {
    expect(isFlightTerminal(makeFlightInfo({ status: "Cancelled" }))).toBe(
      true,
    );
  });

  it("returns true for Diverted", () => {
    expect(isFlightTerminal(makeFlightInfo({ status: "Diverted" }))).toBe(true);
  });
});

describe("getScheduledDepartureUtc", () => {
  it("returns the scheduled UTC time when present", () => {
    const f = makeFlightInfo({
      departure: {
        iata: "GRU",
        name: "Guarulhos",
        scheduledTime: {
          local: "2026-04-01T10:00:00",
          utc: "2026-04-01T13:00:00Z",
        },
        delays: [],
      },
    });
    expect(getScheduledDepartureUtc(f)).toBe("2026-04-01T13:00:00Z");
  });

  it("returns empty string when no scheduled time", () => {
    expect(getScheduledDepartureUtc(makeFlightInfo())).toBe("");
  });
});

describe("normalizeFlightInfo (via fetchFlightInfo) — regression: arrival.actualTime", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses arrival.actualTime not arrival.scheduledTime", async () => {
    const raw = {
      number: "REG001",
      status: "Landed",
      departure: {
        scheduledTime: {
          local: "2026-03-21T10:00:00",
          utc: "2026-03-21T15:00:00Z",
        },
        actualTime: {
          local: "2026-03-21T11:05:00",
          utc: "2026-03-21T16:05:00Z",
        },
        delays: [{ minutes: 65, reason: "Weather" }],
        airport: { iata: "JFK", name: "John F. Kennedy" },
      },
      arrival: {
        scheduledTime: {
          local: "2026-03-21T14:00:00",
          utc: "2026-03-21T19:00:00Z",
        },
        actualTime: {
          local: "2026-03-21T15:10:00",
          utc: "2026-03-21T20:10:00Z",
        },
        airport: { iata: "LAX", name: "Los Angeles International" },
      },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [raw],
      }),
    );

    const info = await fetchFlightInfo("REG001", "2026-03-21", "test-key");

    // Arrival actual time must use actualTime fields, not scheduledTime
    expect(info?.arrival.actualTime?.utc).toBe("2026-03-21T20:10:00Z");
    expect(info?.arrival.actualTime?.local).toBe("2026-03-21T15:10:00");
    // Must NOT use scheduled time values for the actual time fields
    expect(info?.arrival.actualTime?.utc).not.toBe("2026-03-21T19:00:00Z");
  });

  it("normalizes departure actualTime correctly", async () => {
    const raw = {
      number: "REG002",
      status: "Departed",
      departure: {
        scheduledTime: {
          local: "2026-03-22T08:00:00",
          utc: "2026-03-22T12:00:00Z",
        },
        actualTime: {
          local: "2026-03-22T09:10:00",
          utc: "2026-03-22T13:10:00Z",
        },
        delays: [{ minutes: 70 }],
        airport: { iata: "GRU", name: "Guarulhos" },
      },
      arrival: {
        airport: { iata: "GIG", name: "Galeão" },
      },
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [raw],
      }),
    );

    const info = await fetchFlightInfo("REG002", "2026-03-22", "test-key");

    expect(info?.departure.actualTime?.utc).toBe("2026-03-22T13:10:00Z");
    expect(info?.departure.delays?.[0]?.minutes).toBe(70);
  });

  it("returns null on 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }),
    );

    const info = await fetchFlightInfo("XX404", "2026-03-21", "test-key");
    expect(info).toBeNull();
  });
});
