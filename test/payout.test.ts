import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildPayoutMemo, buildTempoChain, PayoutEngine } from '../src/payout.js'
import type { AppConfig } from '../src/types.js'

// Hoist mock fn refs so they're available inside vi.mock factories
const mockReadContract = vi.hoisted(() => vi.fn())
const mockWriteContract = vi.hoisted(() => vi.fn())
const mockWaitForTransactionReceipt = vi.hoisted(() => vi.fn())

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem')
  return {
    ...actual,
    http: vi.fn((url: string) => ({ url })),
    createPublicClient: vi.fn(() => ({
      readContract: mockReadContract,
      waitForTransactionReceipt: mockWaitForTransactionReceipt,
    })),
    createWalletClient: vi.fn(() => ({
      writeContract: mockWriteContract,
    })),
  }
})

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn(() => ({
    address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as `0x${string}`,
  })),
}))

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

// ─── Pure functions ───────────────────────────────────────────

describe('buildPayoutMemo', () => {
  it('formats as flightguard:{policyId}:{flightNumber}:{date}', () => {
    expect(buildPayoutMemo('p-1', 'AA100', '2026-03-24'))
      .toBe('flightguard:p-1:AA100:2026-03-24')
  })

  it('uses exactly 4 colon-separated parts', () => {
    const parts = buildPayoutMemo('uuid-xyz', 'LA3251', '2026-01-15').split(':')
    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe('flightguard')
  })

  it('preserves values without transformation', () => {
    expect(buildPayoutMemo('abc', 'FR999', '2026-12-31'))
      .toBe('flightguard:abc:FR999:2026-12-31')
  })
})

describe('buildTempoChain', () => {
  it('uses the provided chain id', () => {
    const chain = buildTempoChain('https://rpc.example.com', 42431)
    expect(chain.id).toBe(42431)
  })

  it('names mainnet when chainId is 4217', () => {
    const chain = buildTempoChain('https://rpc.tempo.xyz', 4217)
    expect(chain.name).toBe('Tempo Mainnet')
  })

  it('names testnet for any non-mainnet chainId', () => {
    const chain = buildTempoChain('https://rpc.moderato.tempo.xyz', 42431)
    expect(chain.name).toBe('Tempo Testnet')
  })

  it('sets the rpc url in rpcUrls.default.http', () => {
    const rpc = 'https://rpc.example.com'
    const chain = buildTempoChain(rpc, 42431)
    expect(chain.rpcUrls.default.http[0]).toBe(rpc)
  })
})

// ─── PayoutEngine.getPoolBalance ─────────────────────────────

describe('PayoutEngine.getPoolBalance', () => {
  beforeEach(() => {
    mockReadContract.mockReset()
  })

  it('returns formatted balance string', async () => {
    mockReadContract.mockResolvedValue(100_000_000n) // 100.000000 pathUSD
    const engine = new PayoutEngine(config)
    const balance = await engine.getPoolBalance()
    expect(balance).toBe('100')
  })

  it('returns "0.00" when readContract throws', async () => {
    mockReadContract.mockRejectedValue(new Error('RPC error'))
    const engine = new PayoutEngine(config)
    const balance = await engine.getPoolBalance()
    expect(balance).toBe('0.00')
  })
})

// ─── PayoutEngine.sendPayout ─────────────────────────────────

describe('PayoutEngine.sendPayout', () => {
  beforeEach(() => {
    mockReadContract.mockReset()
    mockWriteContract.mockReset()
    mockWaitForTransactionReceipt.mockReset()
  })

  it('returns failure without calling transfer when pool is insufficient', async () => {
    mockReadContract.mockResolvedValue(1_000_000n) // 1 pathUSD
    const engine = new PayoutEngine(config)
    const result = await engine.sendPayout({
      toAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      amountHuman: '5.00',
    })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/insufficient/i)
    expect(mockWriteContract).not.toHaveBeenCalled()
  })

  it('returns success with txHash when transfer confirms', async () => {
    mockReadContract.mockResolvedValue(100_000_000n) // 100 pathUSD
    mockWriteContract.mockResolvedValue('0xdeadbeef')
    mockWaitForTransactionReceipt.mockResolvedValue({
      status: 'success',
      blockNumber: 100n,
      gasUsed: 21_000n,
    })
    const engine = new PayoutEngine(config)
    const result = await engine.sendPayout({
      toAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      amountHuman: '5.00',
      memo: 'flightguard:p1:AA123:2026-03-24',
    })
    expect(result.success).toBe(true)
    expect(result.txHash).toBe('0xdeadbeef')
  })

  it('returns failure when transaction reverts on-chain', async () => {
    mockReadContract.mockResolvedValue(100_000_000n)
    mockWriteContract.mockResolvedValue('0xdeadbeef')
    mockWaitForTransactionReceipt.mockResolvedValue({
      status: 'reverted',
      blockNumber: 100n,
      gasUsed: 21_000n,
    })
    const engine = new PayoutEngine(config)
    const result = await engine.sendPayout({
      toAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      amountHuman: '5.00',
    })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/reverted/i)
  })

  it('returns failure when writeContract throws', async () => {
    mockReadContract.mockResolvedValue(100_000_000n)
    mockWriteContract.mockRejectedValue(new Error('gas estimation failed'))
    const engine = new PayoutEngine(config)
    const result = await engine.sendPayout({
      toAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      amountHuman: '5.00',
    })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/gas estimation/i)
  })
})
