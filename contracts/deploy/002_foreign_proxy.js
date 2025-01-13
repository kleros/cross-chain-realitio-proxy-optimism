const { run } = require("hardhat")
    // Networks -  Mainnet, Sepolia
const FOREIGN_CHAIN_IDS = [1, 11155111];
const paramsByChainId = {
    1: {
        arbitrator: "0x988b3a538b618c7a603e1c11ab82cd16dbe28069", // KlerosLiquid address
        arbitratorExtraData: "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001f", // General Court - 31 jurors
        // https://redstone.xyz/docs/contract-addresses
        messenger: "0x592C1299e0F8331D81A28C0FC7352Da24eDB444a",
        metaEvidence: "/ipfs/bafybeibho6gzezi7ludu6zxfzetmicho7ekuh3gu3oouihmbfsabhcg7te/",
    },

    11155111: {
        arbitrator: "0x90992fb4E15ce0C59aEFfb376460Fda4Ee19C879", // KlerosLiquid address
        arbitratorExtraData: "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        // https://docs.optimism.io/chain/addresses
        messenger: "0x58Cc85b8D04EA49cC6DBd3CbFFd00B4B8D6cb3ef",
        metaEvidence: "/ipfs/QmYj9PRtDV4HpNKXJbJ8AaYv5FBknNuSo4kjH2raHX47eM/",
    },
};

// Note that values apply to both testnet and mainnet since fees are obvserved to be about the same on both chains as of mid 2024.
const winnerMultiplier = 3000;
const loserMultiplier = 7000;
const loserAppealPeriodMultiplier = 5000;

async function deployForeignProxy({ deployments, getChainId, ethers, config }) {
    console.log("Starting foreign proxy deployment..");

    const { deploy } = deployments;
    const chainId = await getChainId();
    const { arbitrator, arbitratorExtraData, messenger, metaEvidence } =
    paramsByChainId[chainId];

    const homeNetworks = {
        1: config.networks.redstone,
        11155111: config.networks.optimismSepolia,
    };

    const { url } = homeNetworks[chainId];
    const provider = new ethers.JsonRpcProvider(url);

    const [account] = await ethers.getSigners();
    let nonce = await provider.getTransactionCount(account.address);
    console.log(`Nonce: ${nonce}`);
    const transaction = {
        from: account.address,
        nonce: nonce - 1, // Subtract 1 to get the nonce that was before home proxy deployment
    };

    const homeProxy = ethers.getCreateAddress(transaction);
    console.log(`Home proxy: ${homeProxy}`);

    const foreignProxy = await deploy("RealitioForeignProxyRedStone", {
        from: account.address,
        args: [
            messenger,
            homeProxy,
            arbitrator,
            arbitratorExtraData,
            metaEvidence, [winnerMultiplier, loserMultiplier, loserAppealPeriodMultiplier],
        ],
        waitConfirmations: 2
    });

    console.log(
        `Foreign proxy contract was successfully deployed at ${foreignProxy.address}`
    );

    await run("verify:verify", {
        address: foreignProxy.address,
        constructorArguments: [
            messenger,
            homeProxy,
            arbitrator,
            arbitratorExtraData,
            metaEvidence, [winnerMultiplier, loserMultiplier, loserAppealPeriodMultiplier],
        ],
    });
}

deployForeignProxy.tags = ["ForeignChain"];
deployForeignProxy.skip = async({ getChainId }) =>
    !FOREIGN_CHAIN_IDS.includes(Number(await getChainId()));

module.exports = deployForeignProxy;