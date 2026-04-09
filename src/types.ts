// ============================================================
// FlightGuard MPP — Shared Types & Constants
// ============================================================

// ------------------------------------------------------------
// POLICY
// ------------------------------------------------------------

export type PolicyStatus =
  | 'active'      // Flight date not yet passed, monitoring
  | 'paid_out'    // Delay threshold exceeded, payout sent
  | 'expired'     // Flight departed without delay, or date passed
  | 'cancelled'   // Flight cancelled — no payout (configurable)

export interface Policy {
  id: string                  // UUID v4
  flightNumber: string        // e.g. "LA3251"
  date: string                // "YYYY-MM-DD"
  payoutAddress: string       // Policyholder's wallet address
  premium: string             // pathUSD amount paid (human-readable, e.g. "1.00")
  payoutAmount: string        // pathUSD amount to pay out (e.g. "5.00")
  status: PolicyStatus
  scheduledDeparture: string  // ISO 8601 datetime from AeroDataBox
  createdAt: number           // Unix timestamp ms
  updatedAt: number           // Unix timestamp ms
  payoutTxHash?: string       // Set when payout fires
  lastCheckedAt?: number      // Last time checker polled this policy
  lastFlightStatus?: string   // Last known flight status string
}

// ------------------------------------------------------------
// FLIGHT API (AeroDataBox response shape)
// ------------------------------------------------------------

export interface FlightDelay {
  minutes: number
  reason?: string
}

export interface FlightAirport {
  iata: string
  name: string
  scheduledTime?: {
    local: string    // "2026-03-19 08:30+01:00"
    utc: string      // "2026-03-19T07:30:00Z"
  }
  actualTime?: {
    local: string
    utc: string
  }
  delays?: FlightDelay[]
  terminal?: string
}

export interface FlightInfo {
  number: string
  status: FlightStatus
  departure: FlightAirport
  arrival: FlightAirport
  airline?: {
    name: string
    iata?: string
  }
}

export type FlightStatus =
  | 'Scheduled'
  | 'Departed'
  | 'EnRoute'
  | 'Landed'
  | 'Arrived'
  | 'Cancelled'
  | 'Diverted'
  | 'Unknown'

// ------------------------------------------------------------
// INSURANCE REQUEST / RESPONSE
// ------------------------------------------------------------

export interface InsureRequest {
  flightNumber: string    // "LA3251"
  date: string            // "YYYY-MM-DD"
  payoutAddress: string   // EVM address to receive payout
}

export interface InsureResponse {
  policyId: string
  flightNumber: string
  date: string
  scheduledDeparture: string
  premium: string
  payoutAmount: string
  payoutAddress: string
  status: PolicyStatus
  message: string
}

export interface PolicyResponse {
  policy: Policy
  flightInfo?: FlightInfo | null
}

// ------------------------------------------------------------
// PAYOUT
// ------------------------------------------------------------

export interface PayoutRequest {
  toAddress: string
  amountHuman: string     // Human-readable, e.g. "5.00"
  memo?: string           // Optional TIP-20 memo for reconciliation
}

export interface PayoutResult {
  success: boolean
  txHash?: string
  error?: string
}

// ------------------------------------------------------------
// CHECKER
// ------------------------------------------------------------

export interface CheckResult {
  policyId: string
  flightNumber: string
  flightStatus: string
  delayMinutes: number
  actionTaken: 'payout' | 'expired' | 'none'
  payoutTxHash?: string
}

// ------------------------------------------------------------
// CONFIG (loaded from env at startup)
// ------------------------------------------------------------

export interface AppConfig {
  // Network
  tempoRpcUrl: string
  chainId: number
  pathUsdAddress: `0x${string}`

  // Pool
  poolPrivateKey: `0x${string}`
  poolAddress: `0x${string}`

  // Server
  port: number

  // Insurance parameters
  premiumAmount: string       // e.g. "1.00"
  payoutMultiplier: number    // e.g. 5
  delayThresholdMin: number   // e.g. 60

  // Polling
  checkIntervalMs: number

  // External APIs
  rapidApiKey: string

  // Alchemy integration (optional)
  alchemyApiKey?: string
  alchemyServiceUrl?: string  // MPP service endpoint — discover via: tempo wallet services --search alchemy
}

// ------------------------------------------------------------
// CONSTANTS
// ------------------------------------------------------------

export const PATHUSD_DECIMALS = 6  // pathUSD uses 6 decimals like USDC

export const AERODATABOX_BASE_URL =
  'https://aerodatabox.p.rapidapi.com'

export const TEMPO_TESTNET = {
  id: 42431,
  name: 'Tempo Testnet (Moderato)',
  rpcUrl: 'https://rpc.moderato.tempo.xyz',
  explorer: 'https://explore.testnet.tempo.xyz',
} as const

export const TEMPO_MAINNET = {
  id: 4217,
  name: 'Tempo Mainnet',
  rpcUrl: 'https://rpc.tempo.xyz',
  explorer: 'https://explore.tempo.xyz',
} as const

export function alchemyRpcUrl(chainId: number, apiKey: string): string {
  const net = chainId === 4217 ? 'tempo-mainnet' : 'tempo-moderato'
  return `https://${net}.g.alchemy.com/v2/${apiKey}`
}

export function alchemyWsUrl(chainId: number, apiKey: string): string {
  const net = chainId === 4217 ? 'tempo-mainnet' : 'tempo-moderato'
  return `wss://${net}.g.alchemy.com/v2/${apiKey}`
}
