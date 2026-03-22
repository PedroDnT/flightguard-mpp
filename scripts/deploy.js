const { ethers } = require("hardhat");

// pathUSD address per network (same contract address on both Tempo networks)
const PATHUSD_ADDRESS = {
  42431: "0x20c0000000000000000000000000000000000000", // Tempo Testnet (Moderato)
  4217:  "0x20c0000000000000000000000000000000000000", // Tempo Mainnet
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  console.log("Deploying FlightGuard...");
  console.log("  Network :", network.name, `(chainId ${chainId})`);
  console.log("  Deployer:", deployer.address);

  const pathUsdAddress = PATHUSD_ADDRESS[chainId];
  if (!pathUsdAddress) throw new Error(`No pathUSD address configured for chainId ${chainId}`);
  console.log("  pathUSD :", pathUsdAddress);

  const FlightGuard = await ethers.getContractFactory("FlightGuard");
  const fg = await FlightGuard.deploy(pathUsdAddress);
  await fg.waitForDeployment();

  const address = await fg.getAddress();
  console.log("\nFlightGuard deployed to:", address);
  console.log("Add to your .env: FLIGHTGUARD_CONTRACT_ADDRESS=" + address);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
