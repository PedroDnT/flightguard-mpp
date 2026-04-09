// ============================================================
// FlightGuard MPP — Alchemy MPP Client
//
// Uses mppx/client to call Alchemy's Prices and Portfolio APIs,
// paying per-call with pathUSD via a persistent MPP session.
//
// FlightGuard is both an MPP server (accepts insurance payments)
// and an MPP client (pays Alchemy for premium blockchain data).
//
// Service discovery: tempo wallet services --search alchemy
// ============================================================

import { Mppx, tempo } from 'mppx/client'
import { privateKeyToAccount } from 'viem/accounts'
import type { AppConfig } from './types.js'

export class AlchemyClient {
  private mppx: ReturnType<typeof Mppx.create>
  private serviceUrl: string

  constructor(config: AppConfig) {
    if (!config.alchemyServiceUrl) throw new Error('ALCHEMY_SERVICE_URL not set')

    this.serviceUrl = config.alchemyServiceUrl.replace(/\/$/, '')

    this.mppx = Mppx.create({
      methods: [
        tempo({
          account: privateKeyToAccount(config.poolPrivateKey),
          // Session mode: auto-manages a payment channel so thousands of
          // micro-calls are aggregated into a single on-chain settlement.
          deposit: '5',
          maxDeposit: '50',
          decimals: 6,
          onChannelUpdate: (entry) =>
            console.log(
              `[ALCHEMY] MPP channel ${entry.opened ? 'open' : 'closed'}` +
              ` — cumulative: ${entry.cumulativeAmount} pathUSD units`,
            ),
        }),
      ],
      polyfill: false, // Don't intercept globalThis.fetch (used by AeroDataBox)
    })
  }

  /**
   * Fetch the current pathUSD price in USD via Alchemy Prices API.
   * Returns null on any error (non-blocking).
   */
  async getPathUsdPrice(): Promise<number | null> {
    try {
      const res = await this.mppx.fetch(
        `${this.serviceUrl}/prices/v1/tokens/by-symbol?symbols=pathUSD`,
      )
      if (!res.ok) return null
      const data = await res.json() as {
        data?: Array<{ prices?: Array<{ value: string }> }>
      }
      const value = data?.data?.[0]?.prices?.[0]?.value
      return value != null ? Number(value) : null
    } catch {
      return null
    }
  }

  /**
   * Fetch the pathUSD balance for a wallet address via Alchemy Portfolio API.
   * Returns human-readable balance string or null on any error.
   */
  async getPathUsdBalance(
    address: string,
    pathUsdAddress: string,
  ): Promise<string | null> {
    try {
      const res = await this.mppx.fetch(
        `${this.serviceUrl}/portfolio/v1/tokens/balances` +
        `?addresses[]=${address}&contractAddresses[]=${pathUsdAddress}`,
      )
      if (!res.ok) return null
      const data = await res.json() as {
        data?: Array<{ tokenBalances?: Array<{ tokenBalance: string }> }>
      }
      return data?.data?.[0]?.tokenBalances?.[0]?.tokenBalance ?? null
    } catch {
      return null
    }
  }
}

/**
 * Create an AlchemyClient when ALCHEMY_SERVICE_URL is configured.
 * Returns null if not configured — all callers must handle null gracefully.
 */
export function createAlchemyClient(config: AppConfig): AlchemyClient | null {
  if (!config.alchemyServiceUrl) return null
  return new AlchemyClient(config)
}
