// ============================================================
// FlightGuard MPP — Tempo Testnet Faucet
//
// Funds an address with 1M each of:
//   pathUSD   0x20c0000000000000000000000000000000000000
//   AlphaUSD  0x20c0000000000000000000000000000000000001
//   BetaUSD   0x20c0000000000000000000000000000000000002
//   ThetaUSD  0x20c0000000000000000000000000000000000003
//
// Usage:
//   npm run faucet                        → funds POOL_ADDRESS from .env
//   npm run faucet -- 0xYourAddress       → funds given address
// ============================================================

require("dotenv").config();
const { execSync } = require("child_process");

const RPC_URL = "https://rpc.moderato.tempo.xyz";

// ── Resolve address ───────────────────────────────────────────

const address = process.argv[2] || process.env.POOL_ADDRESS;

if (!address) {
  console.error(
    "❌ No address provided.\n" +
    "   Usage:  npm run faucet -- 0xYourAddress\n" +
    "   Or set POOL_ADDRESS in your .env"
  );
  process.exit(1);
}

if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
  console.error(`❌ Invalid address: ${address}`);
  process.exit(1);
}

// ── Run faucet ────────────────────────────────────────────────

console.log("╔══════════════════════════════════════════╗");
console.log("║     FlightGuard — Tempo Faucet           ║");
console.log("╚══════════════════════════════════════════╝");
console.log(`Address: ${address}`);
console.log(`RPC:     ${RPC_URL}`);
console.log("");

try {
  execSync(`cast rpc tempo_fundAddress ${address} --rpc-url ${RPC_URL}`, {
    stdio: "inherit",
  });

  console.log("");
  console.log("✅ Funded! Assets sent to " + address + ":");
  console.log("   pathUSD   (0x20c0000000000000000000000000000000000000)  1,000,000");
  console.log("   AlphaUSD  (0x20c0000000000000000000000000000000000001)  1,000,000");
  console.log("   BetaUSD   (0x20c0000000000000000000000000000000000002)  1,000,000");
  console.log("   ThetaUSD  (0x20c0000000000000000000000000000000000003)  1,000,000");
  console.log("");
  console.log("Explorer: https://explore.testnet.tempo.xyz/address/" + address);
} catch (err) {
  console.error("\n❌ Faucet failed.");
  console.error("   Make sure Foundry is installed: https://getfoundry.sh");
  process.exit(1);
}
