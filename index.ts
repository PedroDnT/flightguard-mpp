// ============================================================
// FlightGuard MPP — Entry Point
// ============================================================

import 'dotenv/config'
import { serve } from '@hono/node-server'
import { buildServer } from './src/server.js'
import { FlightChecker } from './src/checker.js'
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
  }
}

// ── Boot ─────────────────────────────────────────────────────

const config = loadConfig()

console.log('╔══════════════════════════════════════════╗')
console.log('║       FlightGuard MPP — Starting         ║')
console.log('╚══════════════════════════════════════════╝')
console.log(`Network:   Tempo (chainId ${config.chainId})`)
console.log(`Pool:      ${config.poolAddress}`)
console.log(`Premium:   ${config.premiumAmount} pathUSD`)
console.log(`Payout:    ${config.payoutMultiplier}x premium`)
console.log(`Threshold: ${config.delayThresholdMin} min delay`)
console.log(`Poll:      every ${config.checkIntervalMs / 1000}s`)
console.log('')

const app = buildServer(config)
const checker = new FlightChecker(config)

serve({ fetch: app.fetch, port: config.port }, () => {
  console.log(`✅ Server running on http://localhost:${config.port}`)
  console.log(`   POST /insure       — buy a policy (MPP-gated)`)
  console.log(`   GET  /policy/:id   — check policy status`)
  console.log(`   GET  /health       — pool balance & stats`)
  console.log(`   GET  /policies     — all policies (debug)`)
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
