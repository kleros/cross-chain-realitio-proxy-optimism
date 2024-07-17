require("dotenv/config");
require("@nomicfoundation/hardhat-toolbox");
require("hardhat-deploy");

/** @type import('hardhat/config').HardhatUserConfig */
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

        holesky: {
            chainId: 17000,
            url: `https://ethereum-holesky.publicnode.com`,
            accounts: [process.env.PRIVATE_KEY],
        },
        garnet: {
            chainId: 17069,
            url: `https://partner-rpc.garnetchain.com/tireless-strand-dreamt-overcome`,
            accounts: [process.env.PRIVATE_KEY],
        },
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