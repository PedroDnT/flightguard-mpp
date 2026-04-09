require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY = process.env.POOL_PRIVATE_KEY || "0x" + "0".repeat(64);
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY;

function tempoRpcUrl(network) {
  if (ALCHEMY_KEY) {
    return `https://${network}.g.alchemy.com/v2/${ALCHEMY_KEY}`;
  }
  return network === "tempo-mainnet"
    ? "https://rpc.tempo.xyz"
    : "https://rpc.moderato.tempo.xyz";
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.19",
        settings: { optimizer: { enabled: true, runs: 200 } },
      },
      {
        version: "0.8.20",
        settings: { optimizer: { enabled: true, runs: 200 } },
      },
    ],
  },
  networks: {
    hardhat: {},
    "tempo-testnet": {
      url: tempoRpcUrl("tempo-moderato"),
      chainId: 42431,
      accounts: [PRIVATE_KEY],
    },
    tempo: {
      url: tempoRpcUrl("tempo-mainnet"),
      chainId: 4217,
      accounts: [PRIVATE_KEY],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
};
