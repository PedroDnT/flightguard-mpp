// ============================================================
// FlightGuard MPP — Testnet integration tests
//
// These tests run against the live Tempo testnet using the
// POOL_PRIVATE_KEY / POOL_ADDRESS credentials that the CI
// "Setup pool wallet" step writes to $GITHUB_ENV.
//
// They are automatically skipped when those env vars are absent
// or contain placeholder text (e.g. local development), so the
// regular unit-test suite is never broken.
// ============================================================

import { describe, it, expect, beforeAll } from 'vitest'
import { createPublicClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { PayoutEngine, buildTempoChain } from '../src/payout.js'
import type { AppConfig } from '../src/types.js'

// ── Read credentials from environment ────────────────────────

const POOL_PRIVATE_KEY = process.env.POOL_PRIVATE_KEY ?? ''
const POOL_ADDRESS     = process.env.POOL_ADDRESS     ?? ''
const TEMPO_RPC_URL    = process.env.TEMPO_RPC_URL    ?? 'https://rpc.moderato.tempo.xyz'
const CHAIN_ID         = Number(process.env.CHAIN_ID  || '42431')
const PATHUSD_ADDRESS  = (
  process.env.PATHUSD_ADDRESS ?? '0x20c0000000000000000000000000000000000000'
) as `0x${string}`

// Only run when CI has provisioned a real, funded wallet.
// A valid private key is 64 hex digits (after 0x) and not all zeros.
const isRealKey     = /^0x[0-9a-fA-F]{64}$/.test(POOL_PRIVATE_KEY) &&
                      POOL_PRIVATE_KEY !== `0x${'0'.repeat(64)}`
const isRealAddress = /^0x[0-9a-fA-F]{40}$/.test(POOL_ADDRESS)
const runTestnet    = isRealKey && isRealAddress

// ── Suite (skipped locally) ───────────────────────────────────

describe.skipIf(!runTestnet)('Testnet integration — funded pool wallet', () => {
  const config: AppConfig = {
    tempoRpcUrl:       TEMPO_RPC_URL,
    chainId:           CHAIN_ID,
    pathUsdAddress:    PATHUSD_ADDRESS,
    poolPrivateKey:    POOL_PRIVATE_KEY as `0x${string}`,
    poolAddress:       POOL_ADDRESS    as `0x${string}`,
    port:              3000,
    premiumAmount:     '1.00',
    payoutMultiplier:  5,
    delayThresholdMin: 60,
    checkIntervalMs:   300_000,
    rapidApiKey:       process.env.RAPIDAPI_KEY ?? '',
  }

  let engine: PayoutEngine
  let publicClient: ReturnType<typeof createPublicClient>

  beforeAll(() => {
    // Assert that POOL_PRIVATE_KEY and POOL_ADDRESS are consistent.
    // PayoutEngine.getPoolBalance() derives the account address from the key
    // (via privateKeyToAccount) and ignores config.poolAddress, so a mismatch
    // would silently query the wrong wallet and produce a misleading balance.
    const derivedAddress = privateKeyToAccount(POOL_PRIVATE_KEY as `0x${string}`).address
    expect(derivedAddress.toLowerCase()).toBe(POOL_ADDRESS.toLowerCase())

    const chain = buildTempoChain(TEMPO_RPC_URL, CHAIN_ID)
    publicClient = createPublicClient({ chain, transport: http(TEMPO_RPC_URL) })
    engine = new PayoutEngine(config)
  })

  it('connects to testnet RPC — getChainId() matches expected chain', async () => {
    // Unlike getPoolBalance(), getChainId() propagates RPC errors instead of
    // swallowing them, giving a genuine connectivity assertion.
    const chainId = await publicClient.getChainId()
    expect(chainId).toBe(CHAIN_ID)
  }, 30_000)

  it('pool is funded — balance is greater than zero (polls until faucet confirms)', async () => {
    // The faucet tx may not be reflected immediately after CI funding.
    // Poll every 3 s (up to 120 s) so a brief propagation delay doesn't
    // produce a spurious failure.
    const readBalance = async () => parseFloat(await engine.getPoolBalance())
    await expect.poll(readBalance, { interval: 3_000, timeout: 120_000 }).toBeGreaterThan(0)
  }, 125_000)
})
