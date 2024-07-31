const { run } = require("hardhat");
// Networks -  RedStone, optimismSepolia
const HOME_CHAIN_IDS = [690, 11155420];
// Redstone Messenger - https://redstone.xyz/docs/contract-addresses
// Optimism Sepolia Messenger - https://docs.optimism.io/chain/addresses

const MESSENGER = "0x4200000000000000000000000000000000000007";
const paramsByChainId = {
    690: {
        // https://github.com/RealityETH/reality-eth-monorepo/blob/main/packages/contracts/chains/deployments/690/ETH/RealityETH-3.0.json
        realitio: "0xc716c23D75f523eF0C511456528F2A1980256a87",
        foreignChainId: 1,
    },
    // https://github.com/RealityETH/reality-eth-monorepo/blob/main/packages/contracts/chains/deployments/11155420/ETH/RealityETH-3.0.json
    11155420: {
        realitio: "0xeAD0ca922390a5E383A9D5Ba4366F7cfdc6f0dbA",
        foreignChainId: 11155111,
    },
};

const metadata =
    '{"tos":"ipfs://QmNV5NWwCudYKfiHuhdWxccrPyxs4DnbLGQace2oMKHkZv/Question_Resolution_Policy.pdf", "foreignProxy":true}'; // Same for all chains.

async function deployHomeProxy({ deployments, getChainId, ethers, config }) {
    console.log(
        `Running deployment script for home proxy contract on RedStone/OP Sepolia`
    );

    const { deploy } = deployments;

    const foreignNetworks = {
        690: config.networks.mainnet,
        11155420: config.networks.sepolia,
    };

    const chainId = await getChainId();
    const { url } = foreignNetworks[chainId];
    console.log(chainId);
    const provider = new ethers.JsonRpcProvider(url);

    const [account] = await ethers.getSigners();

    const nonce = await provider.getTransactionCount(account.address);
    console.log(`Nonce: ${nonce}`);
    const transaction = {
        from: account.address,
        nonce: nonce,
    };
    const foreignProxy = ethers.getCreateAddress(transaction);
    console.log(`Foreign proxy: ${foreignProxy}`);

    const { foreignChainId, realitio } = paramsByChainId[chainId];

    const homeProxy = await deploy("RealitioHomeProxyRedStone", {
        from: account.address,
        args: [realitio, foreignChainId, foreignProxy, metadata, MESSENGER],
        waitConfirmations: 2,
    });
    const contractAddress = homeProxy.address;
    console.log(`RealitioHomeProxyRedStone was deployed to ${contractAddress}`);

    await run("verify:verify", {
        address: homeProxy.address,
        constructorArguments: [
            realitio,
            foreignChainId,
            foreignProxy,
            metadata,
            MESSENGER,
        ],
    });
}

deployHomeProxy.tags = ["HomeChain"];
deployHomeProxy.skip = async({ getChainId }) =>
    !HOME_CHAIN_IDS.includes(Number(await getChainId()));

module.exports = deployHomeProxy;