const { run } = require("hardhat");
const { foreignChains, FOREIGN_CHAIN_IDS } = require("./consts/index");
const { mainnet, sepolia } = foreignChains;

const encodeExtraData = (courtId, minJurors) => ethers.AbiCoder.defaultAbiCoder().encode(
  ["uint96", "uint96"],
  [courtId, minJurors]
);

const klerosLiquid = {
  [mainnet.chainId]: "0x988b3a538b618c7a603e1c11ab82cd16dbe28069",
  [sepolia.chainId]: "0x90992fb4E15ce0C59aEFfb376460Fda4Ee19C879",
}

const paramsByChainId = {
  [mainnet.chainId]: {
    arbitrator: klerosLiquid[mainnet.chainId],
    arbitratorExtraData: encodeExtraData(0, 31), // General Court - 31 jurors
    // https://redstone.xyz/docs/contract-addresses
    messenger: "0x592C1299e0F8331D81A28C0FC7352Da24eDB444a",
    metaEvidence: "/ipfs/bafybeibho6gzezi7ludu6zxfzetmicho7ekuh3gu3oouihmbfsabhcg7te/",
  },
  // [sepolia.chainId]: {
  //   arbitrator: klerosLiquid[sepolia.chainId],
  //   arbitratorExtraData: encodeExtraData(0, 1), // General Court - 1 juror
  //   // https://docs.optimism.io/chain/addresses
  //   messenger: "0x58Cc85b8D04EA49cC6DBd3CbFFd00B4B8D6cb3ef",
  //   metaEvidence: "/ipfs/QmYj9PRtDV4HpNKXJbJ8AaYv5FBknNuSo4kjH2raHX47eM/",
  // },
  [sepolia.chainId]: {
    arbitrator: klerosLiquid[sepolia.chainId],
    arbitratorExtraData: encodeExtraData(0, 1), // General Court - 1 juror
    // https://docs.unichain.org/docs/technical-information/contract-addresses
    messenger: "0x448A37330A60494E666F6DD60aD48d930AEbA381",
    metaEvidence: "/ipfs/TODO/",
  },
};

// Note that values apply to both testnet and mainnet since fees are observed to be about the same on both chains as of mid 2024.
const winnerMultiplier = 3000;
const loserMultiplier = 7000;
const loserAppealPeriodMultiplier = 5000;

async function deployForeignProxy({ deployments, getChainId, ethers, companionNetworks }) {
  console.log("Starting foreign proxy deployment..");

  const { deploy } = deployments;
  const chainId = await getChainId();
  const { arbitrator, arbitratorExtraData, messenger, metaEvidence } = paramsByChainId[chainId];
  const [account] = await ethers.getSigners();
  const homeProxy = await companionNetworks.homeUnichain.deployments
    .get("RealitioHomeProxyRedStone")
    .then((homeProxy) => homeProxy.address);

  // Initially have the deployer as governor, and change it later
  const governor = (await ethers.getSigners())[0].address;

  console.log(
    `Args: messenger=${messenger}, homeProxy=${homeProxy}, governor=${governor}, arbitrator=${arbitrator}, arbitratorExtraData=${arbitratorExtraData}, metaEvidence=${metaEvidence}, multipliers=[${winnerMultiplier}, ${loserMultiplier}, ${loserAppealPeriodMultiplier}]`
  );

  const foreignProxy = await deploy("RealitioForeignProxyRedStone", {
    from: account.address,
    args: [
      messenger,
      homeProxy,
      governor,
      arbitrator,
      arbitratorExtraData,
      metaEvidence,
      [winnerMultiplier, loserMultiplier, loserAppealPeriodMultiplier],
    ],
    waitConfirmations: 1,
  });

  console.log(`Foreign proxy contract was successfully deployed at ${foreignProxy.address}`);

  await run("verify:verify", {
    address: foreignProxy.address,
    constructorArguments: [
      messenger,
      homeProxy,
      governor,
      arbitrator,
      arbitratorExtraData,
      metaEvidence,
      [winnerMultiplier, loserMultiplier, loserAppealPeriodMultiplier],
    ],
  });
}

deployForeignProxy.tags = ["ForeignChain"];
deployForeignProxy.skip = async ({ getChainId }) => !FOREIGN_CHAIN_IDS.includes(Number(await getChainId()));

module.exports = deployForeignProxy;
