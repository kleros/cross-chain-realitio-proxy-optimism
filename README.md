# Cross-chain Reality Proxy Optimism

### ⚠️ The content has been moved to [kleros/cross-chain-realitio-proxy](https://github.com/kleros/cross-chain-realitio-proxy)

## Developer Guide

### Adding support for a new Optimism chain

#### 0. Preliminary
* Get the Reality.eth contract **address** and deployment **block number** from the [Reality monorepo](https://github.com/RealityETH/reality-eth-monorepo/tree/main/packages/contracts/chains/deployments).

#### 1. Hardhat configuration
* Add the new chain configuration to hardhat.config.
* Make sure to add the correct **tag** (home or foreign) and the correct **companion network** for the home and foreign networks (so that both networks have a companion network referring to the other). The deployment scripts rely on them.
* In `package.json`, add the extra convenience scripts: `metaevidence:xxx` , `deploy:xxx`

#### 2. Contracts code
* Build the bridging logic in the proxies if needed. 
  * E.g. for an OP L2 it is not needed, the logic is the same for all OP L2s and is already implemented.
* Test, review etc

#### 3. Dynamic & Evidence scripts
* Add the Reality.eth contract and deployment block number to the script files [here](https://github.com/kleros/cross-chain-realitio-proxy-optimism/blob/1ed08c3ea06ef00398b02f64d1657de3d4ac50c8/dynamic-script/src/index.js#L8) and [here](https://github.com/kleros/cross-chain-realitio-proxy-optimism/blob/1ed08c3ea06ef00398b02f64d1657de3d4ac50c8/evidence-display/src/containers/realitio.js#L10). 
* `yarn build`
* Upload the file `dynamic-script/dist/realitio-dynamic-script-vx.x.x.js` to IPFS.
* Upload the folder `evidence-display/evidence-display-vx.x.x` to IPFS.

#### 4. MetaEvidence
* [In this script](https://github.com/kleros/cross-chain-realitio-proxy-optimism/blob/1ed08c3ea06ef00398b02f64d1657de3d4ac50c8/contracts/tasks/generate-metaevidence.js#L36-L37), update the CIDs with the latest dynamic and evidence scripts uploaded to IPFS in the above steps.
* Run `yarn metaevidence:xxx` for the new chain
* Upload the resulting metaevidence-xxx.json to IPFS

#### 5. Contracts deployment
* Configuration:
  * In the home and foreign proxy deployment script, add a configuration object to `params` .
  * The home script needs the Reality contract address.
  * The foreign script needs the desired courtId and number of jurors (arbitratorExtraData), the L1 bridge address (messenger) and the metaEvidence IPFS URI (from earlier step).
* Deploy and verify with `yarn deploy:xxx`.
* Update the contracts README by running `./scripts/populateReadme.sh`, expand the script if needed.
* Make sure to commit to `deployments` folder to git.

#### 6. Adding support to the Court v1
* Add support for the new chain (because the dynamic/evidence scripts need a RPC provided by the court).
* Whitelist the newly deployed arbitrable.
