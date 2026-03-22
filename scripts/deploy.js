const { ethers } = require("hardhat");

// USDC addresses per network
const USDC_ADDRESS = {
  534351: "0x06eFdbFf2a14a7c8E15944D1F4A48F9F95F663A4", // Scroll Sepolia
  534352: "0x06eFdbFf2a14a7c8E15944D1F4A48F9F95F663A4", // Scroll Mainnet
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);

  console.log("Deploying FlightGuard...");
  console.log("  Network :", network.name, `(chainId ${chainId})`);
  console.log("  Deployer:", deployer.address);

  const usdcAddress = USDC_ADDRESS[chainId];
  if (!usdcAddress) throw new Error(`No USDC address configured for chainId ${chainId}`);
  console.log("  USDC    :", usdcAddress);

  const FlightGuard = await ethers.getContractFactory("FlightGuard");
  const fg = await FlightGuard.deploy(usdcAddress);
  await fg.waitForDeployment();

  const address = await fg.getAddress();
  console.log("\nFlightGuard deployed to:", address);
  console.log("Add to your .env: SCROLL_FLIGHTGUARD_ADDRESS=" + address);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
