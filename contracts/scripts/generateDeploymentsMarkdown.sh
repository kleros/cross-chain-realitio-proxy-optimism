#!/usr/bin/env bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

IGNORED_ARTIFACTS=(
    "None"
)

function generate() { #deploymentDir #explorerUrl
    deploymentDir=$1
    explorerUrl=$2
    for f in $(ls -1 $deploymentDir/*.json 2>/dev/null | grep -v ${IGNORED_ARTIFACTS[@]/#/-e } | sort); do
        contractName=$(basename $f .json)
        address=$(cat $f | jq -r .address)
        implementation=$(cat $f | jq -r .implementation)

        if [ "$implementation" != "null" ]; then
            echo "- [$contractName: proxy]($explorerUrl$address), [implementation]($explorerUrl$implementation)"
        else
            echo "- [$contractName]($explorerUrl$address)"
        fi
    done
}

echo "### Testnet"
echo
echo "#### Unichain Sepolia"
echo
generate "$SCRIPT_DIR/../deployments/unichainSepolia" "https://sepolia.uniscan.xyz/address/"
generate "$SCRIPT_DIR/../deployments/sepolia" "https://sepolia.etherscan.io/address/" | grep 'Unichain'
echo
echo "#### Optimism Sepolia"
echo
generate "$SCRIPT_DIR/../deployments/optimismSepolia" "https://sepolia-optimism.etherscan.io/address/"
generate "$SCRIPT_DIR/../deployments/sepolia" "https://sepolia.etherscan.io/address/" | grep 'Optimism'
echo

