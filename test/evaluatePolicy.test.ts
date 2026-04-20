import { describe, it, expect } from 'vitest'
import { evaluatePolicy } from '../src/domain/policies/evaluatePolicy.js'
import type { AppConfig } from '../src/config/types.js'
import type { FlightInfo } from '../src/integrations/aerodatabox.js'

const config: AppConfig = {
  tempoRpcUrl: 'https://rpc.moderato.tempo.xyz',
  chainId: 42431,
  pathUsdAddress: '0x1111111111111111111111111111111111111111',
  poolPrivateKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
  poolAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  port: 3000,
  premiumAmount: '1.00',
  payoutMultiplier: 5,
  delayThresholdMin: 60,
  checkIntervalMs: 300_000,
  rapidApiKey: 'test',
}

function makeFlightInfo(overrides: Partial<FlightInfo> = {}): FlightInfo {
  return {
    number: 'AA123',
    status: 'Departed',
    departure: {
      iata: 'JFK',
      name: 'John F. Kennedy',
      scheduledTime: { local: '2026-03-24T10:00:00', utc: '2026-03-24T15:00:00Z' },
      actualTime: { local: '2026-03-24T11:05:00', utc: '2026-03-24T16:05:00Z' },
      delays: [{ minutes: 65, reason: 'Weather' }],
    },
    arrival: { iata: 'LAX', name: 'Los Angeles International' },
    ...overrides,
  }
}

describe('evaluatePolicy', () => {
  it('expires cancelled flights', () => {
    const result = evaluatePolicy(makeFlightInfo({
      status: 'Cancelled',
      departure: { iata: 'JFK', name: 'JFK', delays: [] },
    }), config)

    expect(result.actionTaken).toBe('expired')
    expect(result.reason).toMatch(/cancelled/i)
  })

  it('pays out when delay meets threshold', () => {
    const result = evaluatePolicy(makeFlightInfo({
      status: 'Departed',
      departure: { iata: 'JFK', name: 'JFK', delays: [{ minutes: 60 }] },
    }), config)

    expect(result.actionTaken).toBe('payout')
    expect(result.delayMinutes).toBe(60)
  })

  it('expires terminal flights below threshold', () => {
    const result = evaluatePolicy(makeFlightInfo({
      status: 'Landed',
      departure: { iata: 'JFK', name: 'JFK', delays: [{ minutes: 10 }] },
    }), config)

    expect(result.actionTaken).toBe('expired')
    expect(result.reason).toMatch(/below threshold/i)
  })

  it('takes no action for in-progress flights', () => {
    const result = evaluatePolicy(makeFlightInfo({
      status: 'EnRoute',
      departure: { iata: 'JFK', name: 'JFK', delays: [{ minutes: 30 }] },
    }), config)

    expect(result.actionTaken).toBe('none')
    expect(result.reason).toMatch(/in progress/i)
  })
}
