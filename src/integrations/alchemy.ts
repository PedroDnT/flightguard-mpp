import { Mppx, tempo } from "mppx/client";
import { privateKeyToAccount } from "viem/accounts";
import type { AppConfig } from "../config/types.js";
import { createLogger } from "../shared/logger.js";

const log = createLogger("ALCHEMY");

export class AlchemyClient {
  private mppx: ReturnType<typeof Mppx.create>;
  private serviceUrl: string;

  constructor(config: AppConfig) {
    if (!config.alchemyServiceUrl)
      throw new Error("ALCHEMY_SERVICE_URL not set");

    this.serviceUrl = config.alchemyServiceUrl.replace(/\/$/, "");

    this.mppx = Mppx.create({
      methods: [
        tempo({
          account: privateKeyToAccount(config.poolPrivateKey),
          deposit: "5",
          maxDeposit: "50",
          decimals: 6,
          onChannelUpdate: (entry) =>
            log.log(
              `MPP channel ${entry.opened ? "open" : "closed"} — cumulative: ${entry.cumulativeAmount} pathUSD units`,
            ),
        }),
      ],
      polyfill: false,
    });
  }

  async getPathUsdPrice(): Promise<number | null> {
    try {
      const res = await this.mppx.fetch(
        `${this.serviceUrl}/prices/v1/tokens/by-symbol?symbols=pathUSD`,
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        data?: Array<{ prices?: Array<{ value: string }> }>;
      };
      const value = data?.data?.[0]?.prices?.[0]?.value;
      return value != null ? Number(value) : null;
    } catch {
      return null;
    }
  }

  async getPathUsdBalance(
    address: string,
    pathUsdAddress: string,
  ): Promise<string | null> {
    try {
      const res = await this.mppx.fetch(
        `${this.serviceUrl}/portfolio/v1/tokens/balances` +
          `?addresses[]=${address}&contractAddresses[]=${pathUsdAddress}`,
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        data?: Array<{ tokenBalances?: Array<{ tokenBalance: string }> }>;
      };
      return data?.data?.[0]?.tokenBalances?.[0]?.tokenBalance ?? null;
    } catch {
      return null;
    }
  }
}

export function createAlchemyClient(config: AppConfig): AlchemyClient | null {
  if (!config.alchemyServiceUrl) return null;
  return new AlchemyClient(config);
}
