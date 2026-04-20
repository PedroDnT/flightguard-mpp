import "dotenv/config";
import { serve } from "@hono/node-server";
import { buildServer } from "../api/server.js";
import { createAlchemyClient } from "../integrations/alchemy.js";
import { FlightChecker } from "../domain/policies/checker.js";
import { loadConfig } from "../config/loadConfig.js";

const config = loadConfig();

console.log("╔══════════════════════════════════════════╗");
console.log("║       FlightGuard MPP — Starting         ║");
console.log("╚══════════════════════════════════════════╝");
console.log(`Network:   Tempo (chainId ${config.chainId})`);
console.log(
  `RPC:       ${config.alchemyApiKey ? "Alchemy (enterprise)" : "Public"} — ${config.tempoRpcUrl.split("/")[2]}`,
);
console.log(`Pool:      ${config.poolAddress}`);
console.log(`Premium:   ${config.premiumAmount} pathUSD`);
console.log(`Payout:    ${config.payoutMultiplier}x premium`);
console.log(`Threshold: ${config.delayThresholdMin} min delay`);
console.log(`Poll:      every ${config.checkIntervalMs / 1000}s`);
console.log("");

const alchemy = createAlchemyClient(config);
if (alchemy)
  console.log("Alchemy MPP client active — Prices + Portfolio APIs enabled");

const app = buildServer(config, alchemy);
const checker = new FlightChecker(config, alchemy);

serve({ fetch: app.fetch, port: config.port }, () => {
  console.log(`✅ Server running on http://localhost:${config.port}`);
  console.log("   POST /insure       — buy a policy (MPP-gated)");
  console.log("   GET  /policy/:id   — check policy status");
  console.log("   GET  /health       — pool balance & stats");
  console.log("");
});

checker.start();

process.on("SIGTERM", () => {
  console.log("\n[SHUTDOWN] SIGTERM received");
  checker.stop();
  process.exit(0);
});
process.on("SIGINT", () => {
  console.log("\n[SHUTDOWN] SIGINT received");
  checker.stop();
  process.exit(0);
});
