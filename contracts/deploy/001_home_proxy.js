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
    // https://github.com/RealityETH/reality-eth-monorepo/blob/main/packages/contracts/chains/deployments/11155111/ETH/RealityETH-3.0.json
    11155420: {
        realitio: "0xaf33DcB6E8c5c4D9dDF579f53031b514d19449CA",
        foreignChainId: 1,
    },
};

const metadata =
    '{"tos":"ipfs://QmNV5NWwCudYKfiHuhdWxccrPyxs4DnbLGQace2oMKHkZv/Question_Resolution_Policy.pdf", "foreignProxy":true}'; // Same for all chains.

async function deployHomeProxy({ deployments, getChainId, ethers, config }) {
    console.log(`Running deployment script for home proxy contract on RedStone`);

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
        nonce: nonce + 1,
    };
    const foreignProxy = ethers.getCreateAddress(transaction);
    console.log(`Foreign proxy: ${foreignProxy}`);

    const { foreignChainId, realitio } = paramsByChainId[chainId];

    const homeProxy = await deploy("RealitioHomeProxyRedStone", {
        from: account.address,
        args: [realitio, foreignChainId, foreignProxy, metadata, MESSENGER],
    });
    const contractAddress = homeProxy.address;
    console.log(`RealitioHomeProxyRedStone was deployed to ${contractAddress}`);
}

deployHomeProxy.tags = ["HomeChain"];
deployHomeProxy.skip = async({ getChainId }) =>
    !HOME_CHAIN_IDS.includes(Number(await getChainId()));

module.exports = deployHomeProxy;