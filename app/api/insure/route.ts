import { NextRequest, NextResponse } from "next/server";
import { Mppx, tempo } from "mppx/server";
import { store } from "@/src/domain/policies/store";
import {
  fetchFlightInfo,
  getScheduledDepartureUtc,
} from "@/src/integrations/aerodatabox";
import { auditLogger } from "@/lib/audit";
import { getClientIp } from "@/lib/auth";
import type { AppConfig } from "@/src/config/types";
import type { InsureRequest, InsureResponse } from "@/src/api/types";

// Simple in-memory rate limiter: 10 req / 60s per IP
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

function getConfig(): AppConfig {
  return {
    tempoRpcUrl: process.env.TEMPO_RPC_URL ?? "https://rpc.moderato.tempo.xyz",
    chainId: Number(process.env.CHAIN_ID ?? "42431"),
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
    alchemyApiKey: process.env.ALCHEMY_API_KEY,
    alchemyServiceUrl: process.env.ALCHEMY_SERVICE_URL,
  };
}

export async function POST(request: NextRequest) {
  const config = getConfig();
  const ip = getClientIp(request);

  console.log(`[API] POST /api/insure`);

  // Set up MPP
  const mppx = Mppx.create({
    methods: [
      tempo({
        currency: config.pathUsdAddress,
        recipient: config.poolAddress,
      }),
    ],
  });

  // Gate with MPP payment
  const r = await mppx.charge({ amount: config.premiumAmount })(request);
  if (r.status === 402) {
    console.log(`[API] 402 — awaiting payment`);
    return r.challenge;
  }

  // Rate limit
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Parse body
  let body: InsureRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { flightNumber, date, payoutAddress } = body;

  // Validate inputs
  if (!flightNumber || !date || !payoutAddress) {
    return NextResponse.json(
      { error: "Missing required fields: flightNumber, date, payoutAddress" },
      { status: 400 },
    );
  }
  if (!/^[A-Z0-9]{2,8}$/i.test(flightNumber)) {
    return NextResponse.json(
      { error: "Invalid flight number format (e.g. LA3251)" },
      { status: 400 },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "date must be YYYY-MM-DD" },
      { status: 400 },
    );
  }
  const parsedDate = new Date(date + "T00:00:00Z");
  if (
    isNaN(parsedDate.getTime()) ||
    parsedDate.getUTCMonth() + 1 !== parseInt(date.slice(5, 7), 10) ||
    parsedDate.getUTCDate() !== parseInt(date.slice(8, 10), 10)
  ) {
    return NextResponse.json(
      { error: "date is not a valid calendar date" },
      { status: 400 },
    );
  }
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  if (parsedDate < todayUtc) {
    return NextResponse.json(
      { error: "date must not be in the past" },
      { status: 400 },
    );
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(payoutAddress)) {
    return NextResponse.json(
      { error: "payoutAddress must be a valid EVM address" },
      { status: 400 },
    );
  }

  console.log(
    `[API] Insuring flight ${flightNumber} on ${date} → ${payoutAddress}`,
  );

  // Verify flight exists
  let flightInfo;
  try {
    flightInfo = await fetchFlightInfo(flightNumber, date, config.rapidApiKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[API] Flight lookup failed: ${msg}`);
    return NextResponse.json(
      { error: "Flight data unavailable" },
      { status: 503 },
    );
  }

  if (!flightInfo) {
    return NextResponse.json(
      { error: `Flight ${flightNumber} not found for date ${date}` },
      { status: 404 },
    );
  }

  const scheduledDeparture = getScheduledDepartureUtc(flightInfo);
  const premiumCents = BigInt(
    Math.round(parseFloat(config.premiumAmount) * 100),
  );
  const payoutAmount = (
    Number(premiumCents * BigInt(config.payoutMultiplier)) / 100
  ).toFixed(2);

  // Create policy
  const policy = store.create({
    req: { flightNumber, date, payoutAddress },
    premiumAmount: config.premiumAmount,
    payoutAmount,
    scheduledDeparture,
  });

  // Audit log
  auditLogger.log(
    "policy_created",
    {
      policyId: policy.id,
      flightNumber: policy.flightNumber,
      date: policy.date,
      premium: policy.premium,
      payoutAmount: policy.payoutAmount,
      payoutAddress: policy.payoutAddress,
    },
    ip,
    request.headers.get("user-agent") ?? undefined,
  );

  auditLogger.log(
    "payment_received",
    {
      policyId: policy.id,
      amount: config.premiumAmount,
      currency: "pathUSD",
    },
    ip,
  );

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

  console.log(`[API] ✅ Policy issued: ${policy.id}`);
  return r.withReceipt(NextResponse.json(response, { status: 201 }));
}
