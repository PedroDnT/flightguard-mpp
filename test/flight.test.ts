import { describe, it, expect } from 'vitest'
import {
  getDepartureDelayMinutes,
  hasFlightDeparted,
  isFlightTerminal,
} from '../src/flight.js'
import type { FlightInfo } from '../src/types.js'

function makeFlightInfo(overrides: Partial<FlightInfo> = {}): FlightInfo {
  return {
    number: 'LA3251',
    status: 'Scheduled',
    departure: {
      iata: 'GRU',
      name: 'Guarulhos',
      delays: [],
    },
    arrival: {
      iata: 'GIG',
      name: 'Galeão',
    },
    ...overrides,
  }
}

describe('getDepartureDelayMinutes', () => {
  it('returns 0 when no delays', () => {
    expect(getDepartureDelayMinutes(makeFlightInfo())).toBe(0)
  })

  it('returns first delay minutes', () => {
    const f = makeFlightInfo({
      departure: { iata: 'GRU', name: 'GRU', delays: [{ minutes: 75 }] },
    })
    expect(getDepartureDelayMinutes(f)).toBe(75)
  })

  it('returns 0 when delays array is empty', () => {
    const f = makeFlightInfo({
      departure: { iata: 'GRU', name: 'GRU', delays: [] },
    })
    expect(getDepartureDelayMinutes(f)).toBe(0)
  })

  it('returns 0 when delays is undefined', () => {
    const f = makeFlightInfo({
      departure: { iata: 'GRU', name: 'GRU' },
    })
    expect(getDepartureDelayMinutes(f)).toBe(0)
  })
})

describe('hasFlightDeparted', () => {
  it('returns false for Scheduled', () => {
    expect(hasFlightDeparted(makeFlightInfo({ status: 'Scheduled' }))).toBe(false)
  })

  it('returns false for Unknown', () => {
    expect(hasFlightDeparted(makeFlightInfo({ status: 'Unknown' }))).toBe(false)
  })

  it('returns true for Departed', () => {
    expect(hasFlightDeparted(makeFlightInfo({ status: 'Departed' }))).toBe(true)
  })

  it('returns true for EnRoute', () => {
    expect(hasFlightDeparted(makeFlightInfo({ status: 'EnRoute' }))).toBe(true)
  })

  it('returns true for Landed', () => {
    expect(hasFlightDeparted(makeFlightInfo({ status: 'Landed' }))).toBe(true)
  })

  it('returns true for Arrived', () => {
    expect(hasFlightDeparted(makeFlightInfo({ status: 'Arrived' }))).toBe(true)
  })

  it('returns false for Cancelled', () => {
    expect(hasFlightDeparted(makeFlightInfo({ status: 'Cancelled' }))).toBe(false)
  })
})

describe('isFlightTerminal', () => {
  it('returns false for Scheduled', () => {
    expect(isFlightTerminal(makeFlightInfo({ status: 'Scheduled' }))).toBe(false)
  })

  it('returns false for Departed', () => {
    expect(isFlightTerminal(makeFlightInfo({ status: 'Departed' }))).toBe(false)
  })

  it('returns false for EnRoute', () => {
    expect(isFlightTerminal(makeFlightInfo({ status: 'EnRoute' }))).toBe(false)
  })

  it('returns true for Landed', () => {
    expect(isFlightTerminal(makeFlightInfo({ status: 'Landed' }))).toBe(true)
  })

  it('returns true for Arrived', () => {
    expect(isFlightTerminal(makeFlightInfo({ status: 'Arrived' }))).toBe(true)
  })

  it('returns true for Cancelled', () => {
    expect(isFlightTerminal(makeFlightInfo({ status: 'Cancelled' }))).toBe(true)
  })

  it('returns true for Diverted', () => {
    expect(isFlightTerminal(makeFlightInfo({ status: 'Diverted' }))).toBe(true)
  })
})
