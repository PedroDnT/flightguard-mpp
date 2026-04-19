import {
  createWalletClient,
  createPublicClient,
  http,
  webSocket,
  parseUnits,
  formatUnits,
  defineChain,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  PATHUSD_DECIMALS,
  alchemyWsUrl,
  type AppConfig,
} from "../config/types.js";
import { createLogger } from "../shared/logger.js";

export interface PayoutRequest {
  toAddress: string;
  amountHuman: string;
  memo?: string;
}

export interface PayoutResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

const log = createLogger("PAYOUT");

export function buildTempoChain(
  rpcUrl: string,
  chainId: number,
  wsUrl?: string,
) {
  return defineChain({
    id: chainId,
    name: chainId === 4217 ? "Tempo Mainnet" : "Tempo Testnet",
    nativeCurrency: { name: "USD", symbol: "USD", decimals: 18 },
    rpcUrls: {
      default: {
        http: [rpcUrl],
        ...(wsUrl ? { webSocket: [wsUrl] } : {}),
      },
    },
  });
}

const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export class PayoutEngine {
  private config: AppConfig;
  private chain: ReturnType<typeof buildTempoChain>;

  constructor(config: AppConfig) {
    this.config = config;
    const wsUrl = config.alchemyApiKey
      ? alchemyWsUrl(config.chainId, config.alchemyApiKey)
      : undefined;
    this.chain = buildTempoChain(config.tempoRpcUrl, config.chainId, wsUrl);
  }

  async sendPayout(req: PayoutRequest): Promise<PayoutResult> {
    const { toAddress, amountHuman, memo } = req;

    log.log("Initiating payout");
    log.log(`To: ${toAddress}`);
    log.log(`Amount: ${amountHuman} pathUSD`);
    if (memo) log.log(`Memo: ${memo}`);

    try {
      const account = privateKeyToAccount(this.config.poolPrivateKey);

      const walletClient = createWalletClient({
        account,
        chain: this.chain,
        transport: http(this.config.tempoRpcUrl),
      });

      const publicClient = createPublicClient({
        chain: this.chain,
        transport: this.config.alchemyApiKey
          ? webSocket(
              alchemyWsUrl(this.config.chainId, this.config.alchemyApiKey),
            )
          : http(this.config.tempoRpcUrl),
      });

      const amountUnits = parseUnits(amountHuman, PATHUSD_DECIMALS);
      log.log(`Amount in units: ${amountUnits.toString()}`);

      const poolBalance = await publicClient.readContract({
        address: this.config.pathUsdAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [account.address],
      });

      const poolBalanceHuman = formatUnits(poolBalance, PATHUSD_DECIMALS);
      log.log(`Pool balance: ${poolBalanceHuman} pathUSD`);

      if (poolBalance < amountUnits) {
        const msg = `Insufficient pool balance: have ${poolBalanceHuman}, need ${amountHuman}`;
        log.error(`ERROR: ${msg}`);
        return { success: false, error: msg };
      }

      const txHash = await walletClient.writeContract({
        address: this.config.pathUsdAddress,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [toAddress as Address, amountUnits],
      });

      log.log(`Transaction submitted: ${txHash}`);
      log.log(`Explorer: ${getExplorerUrl(this.config.chainId, txHash)}`);

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 30_000,
      });

      if (receipt.status === "success") {
        log.log(`CONFIRMED in block ${receipt.blockNumber}`);
        log.log(`Gas used: ${receipt.gasUsed.toString()}`);
        return { success: true, txHash };
      }

      const msg = `Transaction reverted in block ${receipt.blockNumber}`;
      log.error(`REVERTED: ${msg}`);
      return { success: false, txHash, error: msg };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`ERROR: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async getPoolBalance(): Promise<string> {
    try {
      const publicClient = createPublicClient({
        chain: this.chain,
        transport: this.config.alchemyApiKey
          ? webSocket(
              alchemyWsUrl(this.config.chainId, this.config.alchemyApiKey),
            )
          : http(this.config.tempoRpcUrl),
      });

      const account = privateKeyToAccount(this.config.poolPrivateKey);

      const balance = await publicClient.readContract({
        address: this.config.pathUsdAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [account.address],
      });

      return formatUnits(balance, PATHUSD_DECIMALS);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`Failed to fetch pool balance: ${msg}`);
      return "0.00";
    }
  }
}

function getExplorerUrl(chainId: number, txHash: string): string {
  const base =
    chainId === 4217
      ? "https://explore.tempo.xyz"
      : "https://explore.testnet.tempo.xyz";
  return `${base}/tx/${txHash}`;
}

export function buildPayoutMemo(
  policyId: string,
  flightNumber: string,
  date: string,
): string {
  return `flightguard:${policyId}:${flightNumber}:${date}`;
}
