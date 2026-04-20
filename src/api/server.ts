import { join } from "path";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "@hono/node-server/serve-static";
import { Mppx, tempo } from "mppx/server";
import type { AlchemyClient } from "../integrations/alchemy.js";
import {
  fetchFlightInfo,
  getScheduledDepartureUtc,
} from "../integrations/aerodatabox.js";
import { PayoutEngine } from "../integrations/payout.js";
import { store } from "../domain/policies/store.js";
import type { AppConfig } from "../config/types.js";
import type { InsureRequest, InsureResponse, PolicyResponse } from "./types.js";
import { createLogger } from "../shared/logger.js";

const log = createLogger("SERVER");
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

export function buildServer(
  config: AppConfig,
  alchemy: AlchemyClient | null = null,
): Hono {
  const app = new Hono();
  const payoutEngine = new PayoutEngine(config);

  app.use("/*", serveStatic({ root: join(process.cwd(), "public") }));

  const mppx = Mppx.create({
    methods: [
      tempo({
        currency: config.pathUsdAddress,
        recipient: config.poolAddress,
      }),
    ],
  });

  app.post("/insure", bodyLimit({ maxSize: 1024 }), async (c) => {
    log.log("POST /insure");

    const r = await mppx.charge({ amount: config.premiumAmount })(c.req.raw);
    if (r.status === 402) {
      log.log("402 — awaiting payment");
      return r.challenge;
    }

    const ip =
      c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";
    if (!checkRateLimit(ip)) {
      return c.json({ error: "Too many requests" }, 429);
    }

    let body: InsureRequest;
    try {
      body = await c.req.json<InsureRequest>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { flightNumber, date, payoutAddress } = body;

    if (!flightNumber || !date || !payoutAddress) {
      return c.json(
        { error: "Missing required fields: flightNumber, date, payoutAddress" },
        400,
      );
    }
    if (!/^[A-Z0-9]{2,8}$/i.test(flightNumber)) {
      return c.json(
        { error: "Invalid flight number format (e.g. LA3251)" },
        400,
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json({ error: "date must be YYYY-MM-DD" }, 400);
    }
    const parsedDate = new Date(`${date}T00:00:00Z`);
    if (
      isNaN(parsedDate.getTime()) ||
      parsedDate.getUTCMonth() + 1 !== parseInt(date.slice(5, 7), 10) ||
      parsedDate.getUTCDate() !== parseInt(date.slice(8, 10), 10)
    ) {
      return c.json({ error: "date is not a valid calendar date" }, 400);
    }
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    if (parsedDate < todayUtc) {
      return c.json({ error: "date must not be in the past" }, 400);
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(payoutAddress)) {
      return c.json(
        { error: "payoutAddress must be a valid EVM address" },
        400,
      );
    }

    log.log(`Insuring flight ${flightNumber} on ${date} → ${payoutAddress}`);

    if (alchemy) {
      const balance = await alchemy.getPathUsdBalance(
        payoutAddress,
        config.pathUsdAddress,
      );
      if (balance !== null) {
        log.log(`Policyholder ${payoutAddress} pathUSD balance: ${balance}`);
      }
    }

    let flightInfo;
    try {
      flightInfo = await fetchFlightInfo(
        flightNumber,
        date,
        config.rapidApiKey,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`Flight lookup failed: ${msg}`);
      return c.json({ error: "Flight data unavailable" }, 503);
    }

    if (!flightInfo) {
      return c.json(
        { error: `Flight ${flightNumber} not found for date ${date}` },
        404,
      );
    }

    const scheduledDeparture = getScheduledDepartureUtc(flightInfo);
    const premiumCents = BigInt(
      Math.round(parseFloat(config.premiumAmount) * 100),
    );
    const payoutAmount = (
      Number(premiumCents * BigInt(config.payoutMultiplier)) / 100
    ).toFixed(2);

    const policy = store.create({
      req: { flightNumber, date, payoutAddress },
      premiumAmount: config.premiumAmount,
      payoutAmount,
      scheduledDeparture,
    });

    const response: InsureResponse = {
      policyId: policy.id,
      flightNumber: policy.flightNumber,
      date: policy.date,
      scheduledDeparture: policy.scheduledDeparture,
      premium: policy.premium,
      payoutAmount: policy.payoutAmount,
      payoutAddress: policy.payoutAddress,
      status: policy.status,
      message: `Policy active. Payout of ${payoutAmount} pathUSD fires automatically if departure delay exceeds ${config.delayThresholdMin} minutes.`,
    };

    log.log(`Policy issued: ${policy.id}`);
    return r.withReceipt(c.json(response, 201));
  });

  app.get("/policy/:id", async (c) => {
    const id = c.req.param("id");
    log.log(`GET /policy/${id}`);

    const policy = store.get(id);
    if (!policy) {
      return c.json({ error: `Policy not found: ${id}` }, 404);
    }

    const response: PolicyResponse = { policy };
    return c.json(response);
  });

  app.get("/health", async (c) => {
    log.log("GET /health");

    const poolBalance = await payoutEngine.getPoolBalance();
    const counts = store.countByStatus();

    return c.json({
      status: "ok",
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
    });
  });

  return app;
}
