// SPDX-License-Identifier: MIT

pragma solidity 0.8.25;

import {ICrossDomainMessenger} from "../interfaces/ICrossDomainMessenger.sol";

// @dev https://github.com/ethereum-optimism/optimism/blob/v1.7.7/packages/contracts-bedrock/src/universal/CrossDomainMessenger.sol
contract MockCrossDomainMessenger is ICrossDomainMessenger {
    address public realitioContract;

    address public homeProxy;

    function setHomeProxy(address _homeProxy) external {
        homeProxy = _homeProxy;
    }

    function sendMessage(
        address _target,
        bytes calldata _message,
        uint32 _gasLimit
    ) external {
        (bool success, ) = _target.call(_message);
        require(success, "Failed TxToL1");
    }

    /// @dev https://github.com/ethereum-optimism/optimism/blob/v1.7.7/packages/contracts-bedrock/src/universal/CrossDomainMessenger.sol#L346
    /// @notice Computes the amount of gas required to guarantee that a given message will be
    ///         received on the other chain without running out of gas. Guaranteeing that a message
    ///         will not run out of gas is important because this ensures that a message can always
    ///         be replayed on the other chain if it fails to execute completely.
    /// @param _message     Message to compute the amount of required gas for.
    /// @param _minGasLimit Minimum desired gas limit when message goes to target.
    /// @return Amount of gas required to guarantee message receipt.
    function baseGas(
        bytes calldata _message,
        uint32 _minGasLimit
    ) public pure returns (uint64) {
        return uint64(20000);
    }

    /// @notice Retrieves the address of the contract or wallet that initiated the currently
    ///         executing message on the other chain. Will throw an error if there is no message
    ///         currently being executed. Allows the recipient of a call to see who triggered it.
    /// @return Address of the sender of the currently executing message on the other chain.
    function xDomainMessageSender() external view returns (address) {
        return homeProxy;
    }
}
