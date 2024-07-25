require("dotenv/config");
require("@nomicfoundation/hardhat-toolbox");
require("hardhat-deploy");


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
        optimismSepolia: {
            chainId: 11155420,
            url: `https://optimism-sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
            accounts: [process.env.PRIVATE_KEY],
        },
        sepolia: {
            chainId: 11155111,
            url: `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
            accounts: [process.env.PRIVATE_KEY],
        },

        // mainnets
        mainnet: {
            chainId: 1,
            url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
            accounts: [process.env.PRIVATE_KEY],
        },
        redstone: {
            chainId: 690,
            url: `https://rpc.redstonechain.com`,
            accounts: [process.env.PRIVATE_KEY],
        },

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
};