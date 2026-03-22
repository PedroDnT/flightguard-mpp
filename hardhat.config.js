require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY = process.env.POOL_PRIVATE_KEY || "0x" + "0".repeat(64);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    "tempo-testnet": {
      url: "https://rpc.moderato.tempo.xyz",
      chainId: 42431,
      accounts: [PRIVATE_KEY],
    },
    tempo: {
      url: "https://rpc.tempo.xyz",
      chainId: 4217,
      accounts: [PRIVATE_KEY],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
};
