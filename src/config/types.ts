export interface AppConfig {
  tempoRpcUrl: string;
  chainId: number;
  pathUsdAddress: `0x${string}`;
  poolPrivateKey: `0x${string}`;
  poolAddress: `0x${string}`;
  port: number;
  premiumAmount: string;
  payoutMultiplier: number;
  delayThresholdMin: number;
  checkIntervalMs: number;
  rapidApiKey: string;
  alchemyApiKey?: string;
  alchemyServiceUrl?: string;
}

export const PATHUSD_DECIMALS = 6;

export const AERODATABOX_BASE_URL = "https://aerodatabox.p.rapidapi.com";

export const TEMPO_TESTNET = {
  id: 42431,
  name: "Tempo Testnet (Moderato)",
  rpcUrl: "https://rpc.moderato.tempo.xyz",
  explorer: "https://explore.testnet.tempo.xyz",
} as const;

export const TEMPO_MAINNET = {
  id: 4217,
  name: "Tempo Mainnet",
  rpcUrl: "https://rpc.tempo.xyz",
  explorer: "https://explore.tempo.xyz",
} as const;

export function alchemyRpcUrl(chainId: number, apiKey: string): string {
  const net = chainId === 4217 ? "tempo-mainnet" : "tempo-moderato";
  return `https://${net}.g.alchemy.com/v2/${apiKey}`;
}

export function alchemyWsUrl(chainId: number, apiKey: string): string {
  const net = chainId === 4217 ? "tempo-mainnet" : "tempo-moderato";
  return `wss://${net}.g.alchemy.com/v2/${apiKey}`;
}
