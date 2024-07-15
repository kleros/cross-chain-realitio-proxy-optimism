const FOREIGN_CHAIN_IDS = [11155111, 1];
const paramsByChainId = {
    11155111: {
        arbitrator: "0x90992fb4E15ce0C59aEFfb376460Fda4Ee19C879", // Kleros Liquid on Sepolia
        arbitratorExtraData: "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        // https://garnetchain.com/docs/contract-addresses
        messenger: "0x7FcC26484a6CdF7100c155E7380ab203a244056E",
        metaEvidence: "/ipfs/QmZdBkzD76TTusernqYosnZKGveHu39muv6ygvqjdEWrrW/metaevidence.json",
    },
    1: {
        arbitrator: "0x988b3a538b618c7a603e1c11ab82cd16dbe28069", // KlerosLiquid address
        arbitratorExtraData: "0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001f", // General Court - 31 jurors
        // https://redstone.xyz/docs/contract-addresses
        messenger: "0x592C1299e0F8331D81A28C0FC7352Da24eDB444a",
        metaEvidence: "TODO", // Need to reupload with different chain ids.
    },
};

// Note that values apply to both testnet and mainnet since fees are obvserved to be about the same on both chains as of mid 2024.
const surplus = ethers.utils.parseUnits("0.05", "ether"); // This amount is at least x100 times higher than required amount to account for potential gas fee increase on L1. The surplus will be automatically reimbursed.
const winnerMultiplier = 3000;
const loserMultiplier = 7000;
const loserAppealPeriodMultiplier = 5000;

async function deployForeignProxy({ deployments, getChainId, ethers, config }) {
    console.log("Starting foreign proxy deployment..");

    const { deploy } = deployments;
    const { providers } = ethers;
    const chainId = await getChainId();
    const { arbitrator, arbitratorExtraData, messenger, metaEvidence } =
    paramsByChainId[chainId];

    const homeNetworks = {
        1: config.networks.redstone,
        11155111: config.networks.garnet,
    };

    const { url } = homeNetworks[chainId];
    const provider = new providers.JsonRpcProvider(url);

    const [account] = await ethers.getSigners();
    const nonce = await provider.getTransactionCount(account.address);
    console.log(`Nonce: ${nonce}`);
    const transaction = {
        from: account.address,
        nonce: nonce - 1, // Subtract 1 to get the nonce that was before home proxy deployment
    };

    const homeProxy = ethers.utils.getContractAddress(transaction);
    console.log(`Home proxy: ${homeProxy}`);

    let governor;
    if (chainId === 1) {
        governor = "TODO"; // Determine later
    } else {
        governor = (await ethers.getSigners())[0].address;
    }

    const foreignProxy = await deploy("RealitioForeignProxyRedStone", {
        from: account.address,
        args: [
            messenger,
            homeProxy,
            governor,
            arbitrator,
            arbitratorExtraData,
            surplus,
            metaEvidence, [winnerMultiplier, loserMultiplier, loserAppealPeriodMultiplier],
        ],
    });

    console.log(
        `Foreign proxy contract was successfully deployed at ${foreignProxy.address}`
    );
}

deployForeignProxy.tags = ["ForeignChain"];
deployForeignProxy.skip = async({ getChainId }) =>
    !FOREIGN_CHAIN_IDS.includes(Number(await getChainId()));

module.exports = deployForeignProxy;