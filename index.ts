// ============================================================
// FlightGuard MPP — Entry Point
// ============================================================

import 'dotenv/config'
import { serve } from '@hono/node-server'
import { buildServer } from './src/server.js'
import { FlightChecker } from './src/checker.js'
import { createAlchemyClient } from './src/alchemy.js'
import { alchemyRpcUrl, TEMPO_TESTNET, TEMPO_MAINNET } from './src/types.js'
import type { AppConfig } from './src/types.js'

// ── Load and validate config ─────────────────────────────────

function loadConfig(): AppConfig {
  const required = [
    'POOL_PRIVATE_KEY',
    'POOL_ADDRESS',
    'RAPIDAPI_KEY',
  ]

  for (const key of required) {
    if (!process.env[key]) {
      console.error(`❌ Missing required env var: ${key}`)
      process.exit(1)
    }
  }

  const chainId = Number(process.env.CHAIN_ID ?? '42431')
  const alchemyApiKey = process.env.ALCHEMY_API_KEY || undefined
  const fallbackRpc = alchemyApiKey
    ? alchemyRpcUrl(chainId, alchemyApiKey)
    : (chainId === 4217 ? TEMPO_MAINNET.rpcUrl : TEMPO_TESTNET.rpcUrl)

  return {
    tempoRpcUrl: process.env.TEMPO_RPC_URL ?? fallbackRpc,
    chainId,
    alchemyApiKey,
    alchemyServiceUrl: process.env.ALCHEMY_SERVICE_URL || undefined,
    pathUsdAddress: (process.env.PATHUSD_ADDRESS ?? '0x20c0000000000000000000000000000000000000') as `0x${string}`,
    poolPrivateKey: process.env.POOL_PRIVATE_KEY! as `0x${string}`,
    poolAddress: process.env.POOL_ADDRESS! as `0x${string}`,
    port: Number(process.env.PORT ?? '3000'),
    premiumAmount: process.env.PREMIUM_AMOUNT ?? '1.00',
    payoutMultiplier: Number(process.env.PAYOUT_MULTIPLIER ?? '5'),
    delayThresholdMin: Number(process.env.DELAY_THRESHOLD_MIN ?? '60'),
    checkIntervalMs: Number(process.env.CHECK_INTERVAL_MS ?? '300000'),
    rapidApiKey: process.env.RAPIDAPI_KEY!,
  }
}

// ── Boot ─────────────────────────────────────────────────────

const config = loadConfig()

console.log('╔══════════════════════════════════════════╗')
console.log('║       FlightGuard MPP — Starting         ║')
console.log('╚══════════════════════════════════════════╝')
console.log(`Network:   Tempo (chainId ${config.chainId})`)
console.log(`RPC:       ${config.alchemyApiKey ? 'Alchemy (enterprise)' : 'Public'} — ${config.tempoRpcUrl.split('/')[2]}`)
console.log(`Pool:      ${config.poolAddress}`)
console.log(`Premium:   ${config.premiumAmount} pathUSD`)
console.log(`Payout:    ${config.payoutMultiplier}x premium`)
console.log(`Threshold: ${config.delayThresholdMin} min delay`)
console.log(`Poll:      every ${config.checkIntervalMs / 1000}s`)
console.log('')

const alchemy = createAlchemyClient(config)
if (alchemy) console.log('Alchemy MPP client active — Prices + Portfolio APIs enabled')

const app = buildServer(config, alchemy)
const checker = new FlightChecker(config, alchemy)

serve({ fetch: app.fetch, port: config.port }, () => {
  console.log(`✅ Server running on http://localhost:${config.port}`)
  console.log(`   POST /insure       — buy a policy (MPP-gated)`)
  console.log(`   GET  /policy/:id   — check policy status`)
  console.log(`   GET  /health       — pool balance & stats`)
  console.log('')
})

checker.start()

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n[SHUTDOWN] SIGTERM received')
  checker.stop()
  process.exit(0)
})
process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] SIGINT received')
  checker.stop()
  process.exit(0)
})
