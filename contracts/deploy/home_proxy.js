const HOME_CHAIN_IDS = [690, 17069];
// https://redstone.xyz/docs/contract-addresses
const MESSENGER = "0x4200000000000000000000000000000000000007";
const paramsByChainId = {
    17069: {
        realitio: "",
        foreignChainId: 11155111,
    },
    690: {
        realitio: "",
        foreignChainId: 1,
    },
};

const metadata =
    '{"tos":"ipfs://QmNV5NWwCudYKfiHuhdWxccrPyxs4DnbLGQace2oMKHkZv/Question_Resolution_Policy.pdf", "foreignProxy":true}'; // Same for all chains.

async function deployHomeProxy({ deployments, getChainId, ethers, config }) {
    console.log(`Running deployment script for home proxy contract on RedStone`);

    const { deploy } = deployments;
    const { providers } = ethers;
    const foreignNetworks = {
        690: config.networks.mainnet,
        17069: config.networks.sepolia,
    };

    const chainId = await getChainId();
    const { url } = foreignNetworks[chainId];
    const provider = new providers.JsonRpcProvider(url);
    const [account] = await ethers.getSigners();

    const nonce = await provider.getTransactionCount(account.address);
    console.log(`Nonce: ${nonce}`);
    const transaction = {
        from: account.address,
        nonce: nonce,
    };
    const foreignProxy = ethers.utils.getContractAddress(transaction);
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