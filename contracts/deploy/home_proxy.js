const { toBeHex, toBigInt, ethers } = require("ethers");
// Networks -  Garnet (RedStone testnet), RedStone, localhost
const HOME_CHAIN_IDS = [17069, 690, 31337];
// https://redstone.xyz/docs/contract-addresses
const MESSENGER = "0x4200000000000000000000000000000000000007";
const L1_TO_L2_ALIAS_OFFSET = "0x1111000000000000000000000000000000001111";
const paramsByChainId = {
    17069: {
        realitio: "0x0000000000000000000000000000000000000000",
        foreignChainId: 17000,
    },
    690: {
        realitio: "0x0000000000000000000000000000000000000000",
        foreignChainId: 1,
    },
    // localhost
    31337: {
        realitio: "0x0000000000000000000000000000000000000000",
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
        17069: config.networks.sepolia,
        31337: config.networks.localhost,
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
        args: [
            realitio,
            foreignChainId,
            foreignProxy,
            metadata,
            applyL1ToL2Alias(foreignProxy),
            MESSENGER,
        ],
    });
    const contractAddress = homeProxy.address;
    console.log(`RealitioHomeProxyRedStone was deployed to ${contractAddress}`);
}

const ADDRESS_MODULO = toBigInt(2) ** toBigInt(160);

function applyL1ToL2Alias(address) {
    return toBeHex(
        toBigInt(address) +
        (toBigInt(L1_TO_L2_ALIAS_OFFSET) % toBigInt(ADDRESS_MODULO))
    );
}
deployHomeProxy.tags = ["HomeChain"];
deployHomeProxy.skip = async({ getChainId }) =>
    !HOME_CHAIN_IDS.includes(Number(await getChainId()));

module.exports = deployHomeProxy;