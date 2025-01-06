require("dotenv/config");
require("@nomicfoundation/hardhat-toolbox");
require("hardhat-deploy");
require("@nomicfoundation/hardhat-verify");

module.exports = {
  solidity: {
    version: "0.8.25",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: "./src",
  },
  networks: {
    // testnets
    unichainSepolia: {
      chainId: 1301,
      url: `https://sepolia.unichain.org/`,
      accounts: [process.env.PRIVATE_KEY],
      tags: ["home"],
    },
    optimismSepolia: {
      chainId: 11155420,
      url: `https://optimism-sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: [process.env.PRIVATE_KEY],
      tags: ["home"],
    },
    sepolia: {
      chainId: 11155111,
      url: `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: [process.env.PRIVATE_KEY],
      tags: ["foreign"],
    },
    // mainnets
    redstone: {
      chainId: 690,
      url: `https://rpc.redstonechain.com`,
      accounts: [process.env.PRIVATE_KEY],
      tags: ["home"],
    },
    unichain: {
      chainId: 130,
      url: `https://FIXME.unichain.org/`,
      accounts: [process.env.PRIVATE_KEY],
      tags: ["home"],
    },
    mainnet: {
      chainId: 1,
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: [process.env.PRIVATE_KEY],
      tags: ["foreign"],
    },
    // local
    localhost: {
      url: `http://127.0.0.1:8545`,
      chainId: 31337,
      saveDeployments: true,
      tags: ["test", "local"],
      companionNetworks: {
        home: "localhost",
        foreign: "localhost",
      },
    },
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY,
      optimismSepolia: process.env.OPTIMISM_API_KEY,
      unichainSepolia: process.env.UNISCAN_API_KEY,
      unichain: process.env.UNISCAN_API_KEY,
    },
    customChains: [
      {
        network: "optimismSepolia",
        chainId: 11155420,
        urls: {
          apiURL: "https://api-sepolia-optimistic.etherscan.io/api",
          browserURL: "https://sepolia-optimism.etherscan.io/",
        },
      },
      {
        network: "unichainSepolia",
        chainId: 1301,
        urls: {
          apiURL: "https://sepolia.uniscan.xyz/api",
          browserURL: "https://sepolia.uniscan.xyz/",
        },
      },
      {
        network: "unichain",
        chainId: 130,
        urls: {
          apiURL: "https://uniscan.xyz/api",
          browserURL: "https://uniscan.xyz/",
        },
      },
    ],
  },
};
