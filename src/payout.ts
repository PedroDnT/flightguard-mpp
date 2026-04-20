// ============================================================
// FlightGuard MPP — Tempo payout engine
// Sends pathUSD from pool wallet to policyholder on Tempo
// ============================================================

import {
  createWalletClient,
  createPublicClient,
  http,
  webSocket,
  parseUnits,
  formatUnits,
  defineChain,
  type Address,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  PATHUSD_DECIMALS,
  alchemyWsUrl,
  type PayoutRequest,
  type PayoutResult,
  type AppConfig,
} from './types'

// ------------------------------------------------------------
// Tempo chain definition (viem)
// ------------------------------------------------------------

export function buildTempoChain(rpcUrl: string, chainId: number, wsUrl?: string) {
  return defineChain({
    id: chainId,
    name: chainId === 4217 ? 'Tempo Mainnet' : 'Tempo Testnet',
    nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 18 },
    rpcUrls: {
      default: {
        http: [rpcUrl],
        ...(wsUrl ? { webSocket: [wsUrl] } : {}),
      },
    },
  })
}

// ------------------------------------------------------------
// Minimal ERC-20 / TIP-20 ABI (transfer only)
// ------------------------------------------------------------

const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

// ------------------------------------------------------------
// PAYOUT ENGINE
// ------------------------------------------------------------

export class PayoutEngine {
  private config: AppConfig
  private chain: ReturnType<typeof buildTempoChain>

  constructor(config: AppConfig) {
    this.config = config
    const wsUrl = config.alchemyApiKey
      ? alchemyWsUrl(config.chainId, config.alchemyApiKey)
      : undefined
    this.chain = buildTempoChain(config.tempoRpcUrl, config.chainId, wsUrl)
  }

  /**
   * Send pathUSD from the pool wallet to a policyholder.
   * Returns a PayoutResult with txHash on success.
   */
  async sendPayout(req: PayoutRequest): Promise<PayoutResult> {
    const { toAddress, amountHuman, memo } = req

    console.log(`[PAYOUT] Initiating payout`)
    console.log(`[PAYOUT]   To:     ${toAddress}`)
    console.log(`[PAYOUT]   Amount: ${amountHuman} pathUSD`)
    if (memo) console.log(`[PAYOUT]   Memo:   ${memo}`)

    try {
      const account = privateKeyToAccount(this.config.poolPrivateKey)

      const walletClient = createWalletClient({
        account,
        chain: this.chain,
        transport: http(this.config.tempoRpcUrl),
      })

      const publicClient = createPublicClient({
        chain: this.chain,
        transport: this.config.alchemyApiKey
          ? webSocket(alchemyWsUrl(this.config.chainId, this.config.alchemyApiKey))
          : http(this.config.tempoRpcUrl),
      })

      // Convert human-readable amount to token units (6 decimals)
      const amountUnits = parseUnits(amountHuman, PATHUSD_DECIMALS)

      console.log(`[PAYOUT] Amount in units: ${amountUnits.toString()}`)

      // Check pool balance before sending
      const poolBalance = await publicClient.readContract({
        address: this.config.pathUsdAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      })

      const poolBalanceHuman = formatUnits(poolBalance, PATHUSD_DECIMALS)
      console.log(`[PAYOUT] Pool balance: ${poolBalanceHuman} pathUSD`)

      if (poolBalance < amountUnits) {
        const msg = `Insufficient pool balance: have ${poolBalanceHuman}, need ${amountHuman}`
        console.error(`[PAYOUT] ERROR: ${msg}`)
        return { success: false, error: msg }
      }

      // Send the transfer
      const txHash = await walletClient.writeContract({
        address: this.config.pathUsdAddress,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [toAddress as Address, amountUnits],
      })

      console.log(`[PAYOUT] Transaction submitted: ${txHash}`)
      console.log(`[PAYOUT] Explorer: ${getExplorerUrl(this.config.chainId, txHash)}`)

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 30_000, // 30s timeout — Tempo has sub-second finality
      })

      if (receipt.status === 'success') {
        console.log(`[PAYOUT] ✅ CONFIRMED in block ${receipt.blockNumber}`)
        console.log(`[PAYOUT] Gas used: ${receipt.gasUsed.toString()}`)
        return { success: true, txHash }
      } else {
        const msg = `Transaction reverted in block ${receipt.blockNumber}`
        console.error(`[PAYOUT] ❌ REVERTED: ${msg}`)
        return { success: false, txHash, error: msg }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[PAYOUT] ❌ ERROR: ${msg}`)
      return { success: false, error: msg }
    }
  }

  /**
   * Check the pool's current pathUSD balance.
   * Useful for health checks and logging.
   */
  async getPoolBalance(): Promise<string> {
    try {
      const publicClient = createPublicClient({
        chain: this.chain,
        transport: this.config.alchemyApiKey
          ? webSocket(alchemyWsUrl(this.config.chainId, this.config.alchemyApiKey))
          : http(this.config.tempoRpcUrl),
      })

      const account = privateKeyToAccount(this.config.poolPrivateKey)

      const balance = await publicClient.readContract({
        address: this.config.pathUsdAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [account.address],
      })

      return formatUnits(balance, PATHUSD_DECIMALS)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[PAYOUT] Failed to fetch pool balance: ${msg}`)
      return '0.00'
    }
  }
}

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

function getExplorerUrl(chainId: number, txHash: string): string {
  const base = chainId === 4217
    ? 'https://explore.tempo.xyz'
    : 'https://explore.testnet.tempo.xyz'
  return `${base}/tx/${txHash}`
}

/**
 * Build a payout memo for TIP-20 reconciliation.
 * Format: "flightguard:{policyId}:{flightNumber}:{date}"
 */
export function buildPayoutMemo(
  policyId: string,
  flightNumber: string,
  date: string,
): string {
  return `flightguard:${policyId}:${flightNumber}:${date}`
}
