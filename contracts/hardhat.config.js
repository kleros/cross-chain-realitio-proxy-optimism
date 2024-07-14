require("@nomicfoundation/hardhat-toolbox");

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
    // networks: {
    //     hardhat: {
    //         blockGasLimit: 100000000000,
    //     },
    //     sepolia: {
    //         chainId: 11155111,
    //         url: `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
    //         accounts: [process.env.PRIVATE_KEY],
    //     },
    //     garnet: {
    //         chainId: 17069,
    //         url: `https://partner-rpc.garnetchain.com/tireless-strand-dreamt-overcome`,
    //         accounts: [process.env.PRIVATE_KEY],
    //     },



    //     mainnet: {
    //         chainId: 1,
    //         url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
    //         accounts: [process.env.PRIVATE_KEY],
    //     },
    //     redstone: {
    //         chainId: 690,
    //         url: `https://rpc.redstonechain.com`,
    //         accounts: [process.env.PRIVATE_KEY],
    //     },


    // },
};