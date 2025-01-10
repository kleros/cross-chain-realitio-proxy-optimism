#!/usr/bin/env bash

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

function generate() { #deploymentDir #explorerUrl
    deploymentDir=$1
    explorerUrl=$2
    # shellcheck disable=SC2068
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

IGNORED_ARTIFACTS=("NOP")

declare -A HOME_TESTNETS_EXPLORERS=(
    ["unichainSepolia"]="https://sepolia.uniscan.xyz/address/"
    ["optimismSepolia"]="https://sepolia-optimism.etherscan.io/address/"
)

declare -A HOME_MAINNET_EXPLORERS=(
    ["unichain"]="https://uniscan.xyz/address/"
    ["optimism"]="https://etherscan.io/address/"
    ["redstone"]="https://explorer.redstone.xyz/address/"
)

declare -A FOREIGN_NETWORK_EXPLORERS=(
    ["sepolia"]="https://sepolia.etherscan.io/address/"
    ["mainnet"]="https://etherscan.io/address/"
)

declare -A FILTERS=(
    ["unichainSepolia"]="Unichain"
    ["optimismSepolia"]="Optimism"
    ["unichain"]="Unichain"
    ["optimism"]="Optimism"
    ["redstone"]="Redstone"
)

echo "### Testnet"
for network in "${!HOME_TESTNETS_EXPLORERS[@]}"; do
    echo
    echo "#### ${network^}"
    echo
    generate "$SCRIPT_DIR/../deployments/${network}" "${HOME_TESTNETS_EXPLORERS[$network]}"
    generate "$SCRIPT_DIR/../deployments/sepolia" "${FOREIGN_NETWORK_EXPLORERS[sepolia]}" | grep "${FILTERS[$network]}"
    echo
done
echo
echo "### Mainnet"
for network in "${!HOME_MAINNET_EXPLORERS[@]}"; do
    echo
    echo "#### ${network^}"
    echo
    generate "$SCRIPT_DIR/../deployments/${network}" "${HOME_MAINNET_EXPLORERS[$network]}"
    generate "$SCRIPT_DIR/../deployments/mainnet" "${FOREIGN_NETWORK_EXPLORERS[mainnet]}" | grep "${FILTERS[$network]}"
done
