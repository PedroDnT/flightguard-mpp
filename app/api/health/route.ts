import { NextRequest, NextResponse } from 'next/server'
import { store } from '@/src/store'
import { PayoutEngine } from '@/src/payout'
import type { AppConfig } from '@/src/types'

function getConfig(): AppConfig {
  return {
    tempoRpcUrl: process.env.TEMPO_RPC_URL ?? 'https://rpc.moderato.tempo.xyz',
    chainId: Number(process.env.CHAIN_ID ?? '42431'),
    pathUsdAddress: (process.env.PATHUSD_ADDRESS ?? '0x20c0000000000000000000000000000000000000') as `0x${string}`,
    poolPrivateKey: process.env.POOL_PRIVATE_KEY! as `0x${string}`,
    poolAddress: process.env.POOL_ADDRESS! as `0x${string}`,
    port: Number(process.env.PORT ?? '3000'),
    premiumAmount: process.env.PREMIUM_AMOUNT ?? '1.00',
    payoutMultiplier: Number(process.env.PAYOUT_MULTIPLIER ?? '5'),
    delayThresholdMin: Number(process.env.DELAY_THRESHOLD_MIN ?? '60'),
    checkIntervalMs: Number(process.env.CHECK_INTERVAL_MS ?? '300000'),
    rapidApiKey: process.env.RAPIDAPI_KEY!,
    alchemyApiKey: process.env.ALCHEMY_API_KEY,
    alchemyServiceUrl: process.env.ALCHEMY_SERVICE_URL,
  }
}

export async function GET(request: NextRequest) {
  try {
    const config = getConfig()
    const payoutEngine = new PayoutEngine(config)

    const poolBalance = await payoutEngine.getPoolBalance()
    const counts = store.countByStatus()

    return NextResponse.json({
      status: 'ok',
      pool: {
        address: config.poolAddress,
        balance: `${poolBalance} pathUSD`,
      },
      policies: counts,
      network: {
        chainId: config.chainId,
        rpc: config.tempoRpcUrl,
      },
      config: {
        premium: `${config.premiumAmount} pathUSD`,
        payoutMultiplier: config.payoutMultiplier,
        delayThresholdMin: config.delayThresholdMin,
      },
    })
  } catch (error) {
    console.error('[API] Health check failed:', error)
    return NextResponse.json(
      { error: 'Health check failed' },
      { status: 500 }
    )
  }
}
