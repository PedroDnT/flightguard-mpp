import {
  alchemyRpcUrl,
  TEMPO_MAINNET,
  TEMPO_TESTNET,
  type AppConfig,
} from "./types.js";

export function loadConfig(): AppConfig {
  const required = ["POOL_PRIVATE_KEY", "POOL_ADDRESS", "RAPIDAPI_KEY"];

  for (const key of required) {
    if (!process.env[key]) {
      console.error(`❌ Missing required env var: ${key}`);
      process.exit(1);
    }
  }

  const chainId = Number(process.env.CHAIN_ID ?? "42431");
  const alchemyApiKey = process.env.ALCHEMY_API_KEY || undefined;
  const fallbackRpc = alchemyApiKey
    ? alchemyRpcUrl(chainId, alchemyApiKey)
    : chainId === 4217
      ? TEMPO_MAINNET.rpcUrl
      : TEMPO_TESTNET.rpcUrl;

  return {
    tempoRpcUrl: process.env.TEMPO_RPC_URL ?? fallbackRpc,
    chainId,
    alchemyApiKey,
    alchemyServiceUrl: process.env.ALCHEMY_SERVICE_URL || undefined,
    pathUsdAddress: (process.env.PATHUSD_ADDRESS ??
      "0x20c0000000000000000000000000000000000000") as `0x${string}`,
    poolPrivateKey: process.env.POOL_PRIVATE_KEY! as `0x${string}`,
    poolAddress: process.env.POOL_ADDRESS! as `0x${string}`,
    port: Number(process.env.PORT ?? "3000"),
    premiumAmount: process.env.PREMIUM_AMOUNT ?? "1.00",
    payoutMultiplier: Number(process.env.PAYOUT_MULTIPLIER ?? "5"),
    delayThresholdMin: Number(process.env.DELAY_THRESHOLD_MIN ?? "60"),
    checkIntervalMs: Number(process.env.CHECK_INTERVAL_MS ?? "300000"),
    rapidApiKey: process.env.RAPIDAPI_KEY!,
  };
}
