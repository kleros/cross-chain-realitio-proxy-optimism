const { run } = require("hardhat");
const { homeChains, foreignChains, HOME_CHAIN_IDS } = require("./consts/index");

// Redstone Messenger - https://redstone.xyz/docs/contract-addresses
// Optimism Sepolia Messenger - https://docs.optimism.io/chain/addresses
// Unichain Sepolia Messenger - https://docs.unichain.org/docs/technical-information/contract-addresses

const MESSENGER = "0x4200000000000000000000000000000000000007"; // Same for all the OP chains
const paramsByChainId = {
  [homeChains.redstone.chainId]: {
    // https://github.com/RealityETH/reality-eth-monorepo/blob/main/packages/contracts/chains/deployments/690/ETH/RealityETH-3.0.json
    realitio: "0xc716c23D75f523eF0C511456528F2A1980256a87",
    foreignChain: foreignChains.mainnet,
  },
  // https://github.com/RealityETH/reality-eth-monorepo/blob/main/packages/contracts/chains/deployments/11155420/ETH/RealityETH-3.0.json
  [homeChains.optimismSepolia.chainId]: {
    realitio: "0xeAD0ca922390a5E383A9D5Ba4366F7cfdc6f0dbA",
    foreignChain: foreignChains.sepolia,
  },
  // https://github.com/RealityETH/reality-eth-monorepo/blob/main/packages/contracts/chains/deployments/1301/ETH/RealityETH-3.0.json
  [homeChains.unichainSepolia.chainId]: {
    realitio: "0x0000000000000000000000000000000000000000", // FIXME!
    foreignChain: foreignChains.sepolia,
  },
};

const metadata =
  '{"tos":"ipfs://QmNV5NWwCudYKfiHuhdWxccrPyxs4DnbLGQace2oMKHkZv/Question_Resolution_Policy.pdf", "foreignProxy":true}'; // Same for all chains.

async function deployHomeProxy({ deployments, getChainId, ethers }) {
  console.log(`Running deployment script for home proxy contract on RedStone/OP Sepolia`);

  const { deploy } = deployments;
  const chainId = await getChainId();
  const { foreignChain, realitio } = paramsByChainId[chainId];
  const provider = new ethers.JsonRpcProvider(foreignChain.url);
  const [account] = await ethers.getSigners();
  const nonce = await provider.getTransactionCount(account.address);
  console.log(`Nonce: ${nonce}`);
  const transaction = {
    from: account.address,
    nonce: nonce,
  };
  const foreignProxy = ethers.getCreateAddress(transaction);
  console.log(`Foreign proxy: ${foreignProxy}`);

  console.log(
    `Args: realitio=${realitio}, foreignChainId=${foreignChain.chainId}, foreignProxy=${foreignProxy}, metadata=${metadata}, MESSENGER=${MESSENGER}`
  );

  const homeProxy = await deploy("RealitioHomeProxyRedStone", {
    from: account.address,
    args: [realitio, foreignChain.chainId, foreignProxy, metadata, MESSENGER],
    waitConfirmations: 1,
  });
  const contractAddress = homeProxy.address;
  console.log(`RealitioHomeProxyRedStone was deployed to ${contractAddress}`);

  await run("verify:verify", {
    address: homeProxy.address,
    constructorArguments: [realitio, foreignChain.chainId, foreignProxy, metadata, MESSENGER],
  });
}

deployHomeProxy.tags = ["HomeChain"];
deployHomeProxy.skip = async ({ getChainId }) => !HOME_CHAIN_IDS.includes(Number(await getChainId()));

module.exports = deployHomeProxy;
