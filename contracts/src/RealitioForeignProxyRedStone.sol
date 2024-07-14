// SPDX-License-Identifier: MIT

/**
 *  @authors: [@anmol-dhiman]
 *  @reviewers: []
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity 0.8.25;

import {IDisputeResolver, IArbitrator} from "@kleros/dispute-resolver-interface-contract/contracts/IDisputeResolver.sol";
import {IForeignArbitrationProxy, IHomeArbitrationProxy} from "./interfaces/ArbitrationProxyInterfaces.sol";
import {ICrossDomainMessenger} from "./interfaces/ICrossDomainMessenger.sol";

contract RealitioForeignProxyRedStone is
    IForeignArbitrationProxy,
    IDisputeResolver
{
    /* Constants */
    uint256 public constant NUMBER_OF_CHOICES_FOR_ARBITRATOR =
        type(uint256).max; // The number of choices for the arbitrator.
    uint256 public constant REFUSE_TO_ARBITRATE_REALITIO = type(uint256).max; // Constant that represents "Refuse to rule" in realitio format.
    uint256 public constant MULTIPLIER_DIVISOR = 10000; // Divisor parameter for multipliers.
    uint32 public constant MIN_GAS_LIMIT = 1500000; // Gas limit of the transaction call. Note some L2 operations consume up to 700000 gas.

    /* Storage */

    enum Status {
        None,
        Requested,
        Created,
        Ruled,
        Relayed,
        Failed
    }

    struct ArbitrationRequest {
        Status status; // Status of the arbitration.
        uint248 deposit; // The deposit paid by the requester at the time of the arbitration.
        uint256 disputeID; // The ID of the dispute in arbitrator contract.
        uint256 answer; // The answer given by the arbitrator.
        Round[] rounds; // Tracks each appeal round of a dispute.
        IArbitrator arbitrator; // The arbitrator trusted to solve disputes for this request.
        bytes arbitratorExtraData; // The extra data for the trusted arbitrator of this request.
        uint256 metaEvidenceID; // The meta evidence to be used in a dispute for this case.
    }

    struct DisputeDetails {
        uint256 arbitrationID; // The ID of the arbitration.
        address requester; // The address of the requester who managed to go through with the arbitration request.
    }

    // Round struct stores the contributions made to particular answers.
    struct Round {
        mapping(uint256 => uint256) paidFees; // Tracks the fees paid in this round in the form paidFees[answer].
        mapping(uint256 => bool) hasPaid; // True if the fees for this particular answer have been fully paid in the form hasPaid[answer].
        mapping(address => mapping(uint256 => uint256)) contributions; // Maps contributors to their contributions for each answer in the form contributions[address][answer].
        uint256 feeRewards; // Sum of reimbursable appeal fees available to the parties that made contributions to the answer that ultimately wins a dispute.
        uint256[] fundedAnswers; // Stores the answer choices that are fully funded.
    }

    // contract for L1 -> L2 communication
    ICrossDomainMessenger public MESSENGER;

    address public immutable homeProxy; // Proxy on L2.

    address public governor; // Governor of the contract (e.g KlerosGovernor).
    IArbitrator public arbitrator; // The address of the arbitrator. TRUSTED.
    bytes public arbitratorExtraData; // The extra data used to raise a dispute in the arbitrator.
    uint256 public metaEvidenceUpdates; // The number of times the meta evidence has been updated. Used to track the latest meta evidence ID.

     
    // The amount to add to arbitration fees to cover for RedStone fees. The leftover will be reimbursed. This is required for Realtio UI.
    // Surplus amount covers submission cost for retryable ticket on L1 + gasLimit * gasPriceBid.
    // Submission cost is based on the length of the passed message and current gas fees. It's usually greatly lower than 0.05 but it's preferred to use this value
    // to account for potential gas fee spikes. It shouldn't be an issue since 0.05 is a relatively low value compared to Kleros arbitration cost
    // and the leftover will be reimbursed anyway.
    uint256 public surplusAmount;

    // Multipliers are in basis points.
    uint256 public winnerMultiplier; // Multiplier for calculating the appeal fee that must be paid for the answer that was chosen by the arbitrator in the previous round.
    uint256 public loserMultiplier; // Multiplier for calculating the appeal fee that must be paid for the answer that the arbitrator didn't rule for in the previous round.
    uint256 public loserAppealPeriodMultiplier; // Multiplier for calculating the duration of the appeal period for the loser, in basis points.

    mapping(uint256 => mapping(address => ArbitrationRequest))
        public arbitrationRequests; // Maps arbitration ID to its data. arbitrationRequests[uint(questionID)][requester].
    mapping(uint256 => DisputeDetails) public disputeIDToDisputeDetails; // Maps external dispute ids to local arbitration ID and requester who was able to complete the arbitration request.
    mapping(uint256 => bool) public arbitrationIDToDisputeExists; // Whether a dispute has already been created for the given arbitration ID or not.
    mapping(uint256 => address) public arbitrationIDToRequester; // Maps arbitration ID to the requester who was able to complete the arbitration request.

    event RetryableTicketCreated(uint256 indexed ticketId);

    modifier onlyL2Bridge() {
        require(msg.sender == address(MESSENGER), "NOT_BRIDGE");
        require(
            MESSENGER.xDomainMessageSender() == address(homeProxy),
            "Can only be called by Home proxy"
        );
        _;
    }

    modifier onlyGovernor() {
        require(msg.sender == governor, "The caller must be the governor.");
        _;
    }

    /**
     * @notice Creates an arbitration proxy on the foreign chain (L1).
     * @param _messenger contract for L1 -> L2 tx
     * @param _homeProxy Proxy on L2.
     * @param _governor Governor of the contract.
     * @param _arbitrator Arbitrator contract address.
     * @param _arbitratorExtraData The extra data used to raise a dispute in the arbitrator.
     * @param _surplusAmount The surplus amount to cover RedStone fees.
     * @param _metaEvidence The URI of the meta evidence file.
     * @param _multipliers Appeal multipliers:
     *  - Multiplier for calculating the appeal cost of the winning answer.
     *  - Multiplier for calculating the appeal cost of the losing answer.
     *  - Multiplier for calculating the appeal period for the losing answer.
     */
    constructor(
        address _messenger,
        address _homeProxy,
        address _governor,
        IArbitrator _arbitrator,
        bytes memory _arbitratorExtraData,
        uint256 _surplusAmount,
        string memory _metaEvidence,
        uint256[3] memory _multipliers
    ) {
        MESSENGER = ICrossDomainMessenger(_messenger);
        homeProxy = _homeProxy;
        governor = _governor;
        arbitrator = _arbitrator;
        arbitratorExtraData = _arbitratorExtraData;
        surplusAmount = _surplusAmount;
        winnerMultiplier = _multipliers[0];
        loserMultiplier = _multipliers[1];
        loserAppealPeriodMultiplier = _multipliers[2];

        emit MetaEvidence(metaEvidenceUpdates, _metaEvidence);
    }

    // ********************************* //
    // *    Governor Functions    * //
    // ********************************* //
    /**
     * @notice Changes the L1 -> L2 MESSENGER contract.
     * @param _messenger New MESSENGER address.
     */
    function changeMessenger(address _messenger) external onlyGovernor {
        MESSENGER = ICrossDomainMessenger(_messenger);
    }

    /**
     * @notice Changes the governor of the contract.
     * @param _governor New governor address.
     */
    function changeGovernor(address _governor) external onlyGovernor {
        governor = _governor;
    }

    /**
     * @notice Changes the arbitrator and extradata. The arbitrator is trusted to support appeal period and not reenter.
     * Note avoid changing arbitrator if there is an active arbitration request in Requested phase, otherwise evidence submitted during this phase
     * will be submitted to the new arbitrator, while arbitration request will be processed by the old one.
     * @param _arbitrator New arbitrator address.
     * @param _arbitratorExtraData Extradata for the arbitrator
     */
    function changeArbitrator(
        IArbitrator _arbitrator,
        bytes calldata _arbitratorExtraData
    ) external onlyGovernor {
        arbitrator = _arbitrator;
        arbitratorExtraData = _arbitratorExtraData;
    }

    /**
     * @notice Updates the meta evidence used for disputes.
     * @param _metaEvidence Metaevidence URI.
     */
    function changeMetaevidence(
        string memory _metaEvidence
    ) external onlyGovernor {
        metaEvidenceUpdates++;
        emit MetaEvidence(metaEvidenceUpdates, _metaEvidence);
    }

    
    /**
     * @notice Changes the surplus amount to cover the RedStone fees.
     * @param _surplus New surplus value.
     */
    function changeSurplus(uint256 _surplus) external onlyGovernor {
        surplusAmount = _surplus;
    }

    /**
     * @notice Changes winner multiplier value.
     * @param _winnerMultiplier New winner multiplier.
     */
    function changeWinnerMultiplier(
        uint256 _winnerMultiplier
    ) external onlyGovernor {
        winnerMultiplier = _winnerMultiplier;
    }

    /**
     * @notice Changes loser multiplier value.
     * @param _loserMultiplier New loser multiplier.
     */
    function changeLoserMultiplier(
        uint256 _loserMultiplier
    ) external onlyGovernor {
        loserMultiplier = _loserMultiplier;
    }

    /**
     * @notice Changes loser multiplier for appeal period.
     * @param _loserAppealPeriodMultiplier New loser multiplier for appeal perido.
     */
    function changeLoserAppealPeriodMultiplier(
        uint256 _loserAppealPeriodMultiplier
    ) external onlyGovernor {
        loserAppealPeriodMultiplier = _loserAppealPeriodMultiplier;
    }

    /*//////////////////////////////////////////////////////////////
                             REALITIO LOGIC
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Requests arbitration for the given question and contested answer.
     * @param _questionID The ID of the question.
     * @param _maxPrevious The maximum value of the current bond for the question. The arbitration request will get rejected if the current bond is greater than _maxPrevious. If set to 0, _maxPrevious is ignored.
     */
    function requestArbitration(
        bytes32 _questionID,
        uint256 _maxPrevious
    ) external payable override {
        require(
            !arbitrationIDToDisputeExists[uint256(_questionID)],
            "Dispute already created"
        );

        ArbitrationRequest storage arbitration = arbitrationRequests[
            uint256(_questionID)
        ][msg.sender];
        require(
            arbitration.status == Status.None,
            "Arbitration already requested"
        );

        arbitration.arbitrator = arbitrator;
        arbitration.arbitratorExtraData = arbitratorExtraData;
        arbitration.metaEvidenceID = metaEvidenceUpdates;

        bytes4 methodSelector = IHomeArbitrationProxy
            .receiveArbitrationRequest
            .selector;
        bytes memory data = abi.encodeWithSelector(
            methodSelector,
            _questionID,
            msg.sender,
            _maxPrevious
        );
        uint256 arbitrationCost = arbitrator.arbitrationCost(
            arbitratorExtraData
        );
        uint gasFee = MESSENGER.baseGas(data, MIN_GAS_LIMIT);

        require(msg.value >= arbitrationCost + gasFee, "Deposit value too low");

        arbitration.status = Status.Requested;
        arbitration.deposit = uint248(msg.value - gasFee);

        MESSENGER.sendMessage(homeProxy, data, MIN_GAS_LIMIT);
        emit ArbitrationRequested(_questionID, msg.sender, _maxPrevious);
    }

    /**
     * @notice Receives the acknowledgement of the arbitration request for the given question and requester. TRUSTED.
     * @param _questionID The ID of the question.
     * @param _requester The requester.
     */
    function receiveArbitrationAcknowledgement(
        bytes32 _questionID,
        address _requester
    ) public override onlyL2Bridge {
        uint256 arbitrationID = uint256(_questionID);
        ArbitrationRequest storage arbitration = arbitrationRequests[
            arbitrationID
        ][_requester];
        require(
            arbitration.status == Status.Requested,
            "Invalid arbitration status"
        );

        uint256 arbitrationCost = arbitration.arbitrator.arbitrationCost(
            arbitration.arbitratorExtraData
        );
        if (arbitration.deposit >= arbitrationCost) {
            try
                arbitration.arbitrator.createDispute{value: arbitrationCost}(
                    NUMBER_OF_CHOICES_FOR_ARBITRATOR,
                    arbitration.arbitratorExtraData
                )
            returns (uint256 disputeID) {
                DisputeDetails
                    storage disputeDetails = disputeIDToDisputeDetails[
                        disputeID
                    ];
                disputeDetails.arbitrationID = arbitrationID;
                disputeDetails.requester = _requester;

                arbitrationIDToDisputeExists[arbitrationID] = true;
                arbitrationIDToRequester[arbitrationID] = _requester;

                // At this point, arbitration.deposit is guaranteed to be greater than or equal to the arbitration cost.
                uint256 remainder = arbitration.deposit - arbitrationCost;

                arbitration.status = Status.Created;
                arbitration.deposit = 0;
                arbitration.disputeID = disputeID;
                arbitration.rounds.push();

                if (remainder > 0) {
                    payable(_requester).send(remainder);
                }

                emit ArbitrationCreated(_questionID, _requester, disputeID);
                emit Dispute(
                    arbitration.arbitrator,
                    disputeID,
                    arbitration.metaEvidenceID,
                    arbitrationID
                );
            } catch {
                arbitration.status = Status.Failed;
                emit ArbitrationFailed(_questionID, _requester);
            }
        } else {
            arbitration.status = Status.Failed;
            emit ArbitrationFailed(_questionID, _requester);
        }
    }

    /**
     * @notice Receives the cancelation of the arbitration request for the given question and requester. TRUSTED.
     * @param _questionID The ID of the question.
     * @param _requester The requester.
     */
    function receiveArbitrationCancelation(
        bytes32 _questionID,
        address _requester
    ) public override onlyL2Bridge {
        uint256 arbitrationID = uint256(_questionID);
        ArbitrationRequest storage arbitration = arbitrationRequests[
            arbitrationID
        ][_requester];
        require(
            arbitration.status == Status.Requested,
            "Invalid arbitration status"
        );
        uint256 deposit = arbitration.deposit;

        delete arbitrationRequests[arbitrationID][_requester];
        payable(_requester).send(deposit);

        emit ArbitrationCanceled(_questionID, _requester);
    }

    /**
     * @notice Cancels the arbitration in case the dispute could not be created. Requires a small deposit to cover RedStone fees.
     * @param _questionID The ID of the question.
     * @param _requester The address of the arbitration requester.
     */
    function handleFailedDisputeCreation(
        bytes32 _questionID,
        address _requester
    ) external payable override {
        uint256 arbitrationID = uint256(_questionID);
        ArbitrationRequest storage arbitration = arbitrationRequests[
            arbitrationID
        ][_requester];
        require(
            arbitration.status == Status.Failed,
            "Invalid arbitration status"
        );

        bytes4 methodSelector = IHomeArbitrationProxy
            .receiveArbitrationFailure
            .selector;
        bytes memory data = abi.encodeWithSelector(
            methodSelector,
            _questionID,
            _requester
        );

        uint gasFee = MESSENGER.baseGas(data, MIN_GAS_LIMIT);
        require(msg.value >= gasFee, "Should cover gasFee");
        uint256 deposit = arbitration.deposit;

        delete arbitrationRequests[arbitrationID][_requester];
        uint256 surplusValue = msg.value - gasFee;
        payable(msg.sender).send(surplusValue);
        payable(_requester).send(deposit);

        MESSENGER.sendMessage(homeProxy, data, MIN_GAS_LIMIT);
        emit ArbitrationCanceled(_questionID, _requester);
    }

    // ********************************* //
    // *    Appeals and arbitration    * //
    // ********************************* //

    /**
     * @notice Takes up to the total amount required to fund an answer. Reimburses the rest. Creates an appeal if at least two answers are funded.
     * @param _arbitrationID The ID of the arbitration, which is questionID cast into uint256.
     * @param _answer One of the possible rulings the arbitrator can give that the funder considers to be the correct answer to the question.
     * Note that the answer has Kleros denomination, meaning that it has '+1' offset compared to Realitio format.
     * Also note that '0' answer can be funded.
     * @return Whether the answer was fully funded or not.
     */
    function fundAppeal(
        uint256 _arbitrationID,
        uint256 _answer
    ) external payable override returns (bool) {
        ArbitrationRequest storage arbitration = arbitrationRequests[
            _arbitrationID
        ][arbitrationIDToRequester[_arbitrationID]];
        require(arbitration.status == Status.Created, "No dispute to appeal.");

        uint256 disputeID = arbitration.disputeID;
        (uint256 appealPeriodStart, uint256 appealPeriodEnd) = arbitration
            .arbitrator
            .appealPeriod(disputeID);
        require(
            block.timestamp >= appealPeriodStart &&
                block.timestamp < appealPeriodEnd,
            "Appeal period is over."
        );

        uint256 multiplier;
        {
            uint256 winner = arbitration.arbitrator.currentRuling(disputeID);
            if (winner == _answer) {
                multiplier = winnerMultiplier;
            } else {
                require(
                    block.timestamp - appealPeriodStart <
                        ((appealPeriodEnd - appealPeriodStart) *
                            (loserAppealPeriodMultiplier)) /
                            MULTIPLIER_DIVISOR,
                    "Appeal period is over for loser"
                );
                multiplier = loserMultiplier;
            }
        }

        uint256 lastRoundID = arbitration.rounds.length - 1;
        Round storage round = arbitration.rounds[lastRoundID];
        require(!round.hasPaid[_answer], "Appeal fee is already paid.");
        uint256 appealCost = arbitration.arbitrator.appealCost(
            disputeID,
            arbitration.arbitratorExtraData
        );
        uint256 totalCost = appealCost +
            ((appealCost * multiplier) / MULTIPLIER_DIVISOR);

        // Take up to the amount necessary to fund the current round at the current costs.
        uint256 contribution = totalCost - (round.paidFees[_answer]) > msg.value
            ? msg.value
            : totalCost - (round.paidFees[_answer]);
        emit Contribution(
            _arbitrationID,
            lastRoundID,
            _answer,
            msg.sender,
            contribution
        );

        round.contributions[msg.sender][_answer] += contribution;
        round.paidFees[_answer] += contribution;
        if (round.paidFees[_answer] >= totalCost) {
            round.feeRewards += round.paidFees[_answer];
            round.fundedAnswers.push(_answer);
            round.hasPaid[_answer] = true;
            emit RulingFunded(_arbitrationID, lastRoundID, _answer);
        }

        if (round.fundedAnswers.length > 1) {
            // At least two sides are fully funded.
            arbitration.rounds.push();

            round.feeRewards = round.feeRewards - appealCost;
            arbitration.arbitrator.appeal{value: appealCost}(
                disputeID,
                arbitration.arbitratorExtraData
            );
        }

        if (msg.value - contribution > 0)
            payable(msg.sender).send(msg.value - contribution); // Sending extra value back to contributor. It is the user's responsibility to accept ETH.
        return round.hasPaid[_answer];
    }

    /**
     * @notice Sends the fee stake rewards and reimbursements proportional to the contributions made to the winner of a dispute. Reimburses contributions if there is no winner.
     * @param _arbitrationID The ID of the arbitration.
     * @param _beneficiary The address to send reward to.
     * @param _round The round from which to withdraw.
     * @param _answer The answer to query the reward from.
     * @return reward The withdrawn amount.
     */
    function withdrawFeesAndRewards(
        uint256 _arbitrationID,
        address payable _beneficiary,
        uint256 _round,
        uint256 _answer
    ) public override returns (uint256 reward) {
        address requester = arbitrationIDToRequester[_arbitrationID];
        ArbitrationRequest storage arbitration = arbitrationRequests[
            _arbitrationID
        ][requester];
        Round storage round = arbitration.rounds[_round];
        require(arbitration.status == Status.Ruled, "Dispute not resolved");
        // Allow to reimburse if funding of the round was unsuccessful.
        if (!round.hasPaid[_answer]) {
            reward = round.contributions[_beneficiary][_answer];
        } else if (!round.hasPaid[arbitration.answer]) {
            // Reimburse unspent fees proportionally if the ultimate winner didn't pay appeal fees fully.
            // Note that if only one side is funded it will become a winner and this part of the condition won't be reached.
            reward = round.fundedAnswers.length > 1
                ? (round.contributions[_beneficiary][_answer] *
                    round.feeRewards) /
                    (round.paidFees[round.fundedAnswers[0]] +
                        round.paidFees[round.fundedAnswers[1]])
                : 0;
        } else if (arbitration.answer == _answer) {
            uint256 paidFees = round.paidFees[_answer];
            // Reward the winner.
            reward = paidFees > 0
                ? (round.contributions[_beneficiary][_answer] *
                    round.feeRewards) / paidFees
                : 0;
        }

        if (reward != 0) {
            round.contributions[_beneficiary][_answer] = 0;
            _beneficiary.send(reward); // It is the user's responsibility to accept ETH.
            emit Withdrawal(
                _arbitrationID,
                _round,
                _answer,
                _beneficiary,
                reward
            );
        }
    }

    /**
     * @notice Allows to withdraw any rewards or reimbursable fees for all rounds at once.
     * @dev This function is O(n) where n is the total number of rounds. Arbitration cost of subsequent rounds is `A(n) = 2A(n-1) + 1`.
     *      So because of this exponential growth of costs, you can assume n is less than 10 at all times.
     * @param _arbitrationID The ID of the arbitration.
     * @param _beneficiary The address that made contributions.
     * @param _contributedTo Answer that received contributions from contributor.
     */
    function withdrawFeesAndRewardsForAllRounds(
        uint256 _arbitrationID,
        address payable _beneficiary,
        uint256 _contributedTo
    ) external override {
        address requester = arbitrationIDToRequester[_arbitrationID];
        ArbitrationRequest storage arbitration = arbitrationRequests[
            _arbitrationID
        ][requester];

        uint256 numberOfRounds = arbitration.rounds.length;
        for (
            uint256 roundNumber = 0;
            roundNumber < numberOfRounds;
            roundNumber++
        ) {
            withdrawFeesAndRewards(
                _arbitrationID,
                _beneficiary,
                roundNumber,
                _contributedTo
            );
        }
    }

    /**
     * @notice Allows to submit evidence for a particular question.
     * @param _arbitrationID The ID of the arbitration related to the question.
     * @param _evidenceURI Link to evidence.
     */
    function submitEvidence(
        uint256 _arbitrationID,
        string calldata _evidenceURI
    ) external override {
        address requester = arbitrationIDToRequester[_arbitrationID];
        ArbitrationRequest storage arbitration = arbitrationRequests[
            _arbitrationID
        ][requester];
        if (address(arbitration.arbitrator) == address(0)) {
            //None or Requested status.
            // Note that arbitrator set during requestArbitration might differ from default arbitrator, if default arbitrator was changed during Requested status.
            emit Evidence(arbitrator, _arbitrationID, msg.sender, _evidenceURI);
        } else {
            emit Evidence(
                arbitration.arbitrator,
                _arbitrationID,
                msg.sender,
                _evidenceURI
            );
        }
    }

    /**
     * @notice Rules a specified dispute. Can only be called by the arbitrator.
     * @dev Accounts for the situation where the winner loses a case due to paying less appeal fees than expected.
     * @param _disputeID The ID of the dispute in the ERC792 arbitrator.
     * @param _ruling The ruling given by the arbitrator.
     */
    function rule(uint256 _disputeID, uint256 _ruling) external override {
        DisputeDetails storage disputeDetails = disputeIDToDisputeDetails[
            _disputeID
        ];
        uint256 arbitrationID = disputeDetails.arbitrationID;
        address requester = disputeDetails.requester;

        ArbitrationRequest storage arbitration = arbitrationRequests[
            arbitrationID
        ][requester];
        require(
            msg.sender == address(arbitration.arbitrator),
            "Only arbitrator allowed"
        );
        require(
            arbitration.status == Status.Created,
            "Invalid arbitration status"
        );
        uint256 finalRuling = _ruling;

        // If one side paid its fees, the ruling is in its favor. Note that if the other side had also paid, an appeal would have been created.
        Round storage round = arbitration.rounds[arbitration.rounds.length - 1];
        if (round.fundedAnswers.length == 1)
            finalRuling = round.fundedAnswers[0];

        arbitration.answer = finalRuling;
        arbitration.status = Status.Ruled;
        emit Ruling(IArbitrator(msg.sender), _disputeID, finalRuling);
    }

    /**
     * @notice Relays the ruling to home proxy. Requires a small deposit to cover RedStone fees.
     * @param _questionID The ID of the question.
     * @param _requester The address of the arbitration requester.
     */
    function relayRule(
        bytes32 _questionID,
        address _requester
    ) external payable {
        uint256 arbitrationID = uint256(_questionID);
        ArbitrationRequest storage arbitration = arbitrationRequests[
            arbitrationID
        ][_requester];
        require(arbitration.status == Status.Ruled, "Dispute not resolved");

        // Realitio ruling is shifted by 1 compared to Kleros.
        uint256 realitioRuling = arbitration.answer != 0
            ? arbitration.answer - 1
            : REFUSE_TO_ARBITRATE_REALITIO;

        bytes4 methodSelector = IHomeArbitrationProxy
            .receiveArbitrationAnswer
            .selector;
        bytes memory data = abi.encodeWithSelector(
            methodSelector,
            _questionID,
            bytes32(realitioRuling)
        );
        uint gasFee = MESSENGER.baseGas(data, MIN_GAS_LIMIT);
        require(msg.value >= gasFee, "Should cover gas fee");

        arbitration.status = Status.Relayed;

        MESSENGER.sendMessage(homeProxy, data, MIN_GAS_LIMIT);
        emit RulingRelayed(_questionID, bytes32(realitioRuling));

        if (msg.value - gasFee > 0)
            payable(msg.sender).send(msg.value - gasFee); // Sending extra value back to contributor. It is the user's responsibility to accept ETH.
    }

    // ********************************* //
    // *    External View Functions    * //
    // ********************************* //

    /**
     * @notice Returns stake multipliers.
     * @return winner Winners stake multiplier.
     * @return loser Losers stake multiplier.
     * @return loserAppealPeriod Multiplier for calculating an appeal period duration for the losing side.
     * @return divisor Multiplier divisor.
     */
    function getMultipliers()
        external
        view
        override
        returns (
            uint256 winner,
            uint256 loser,
            uint256 loserAppealPeriod,
            uint256 divisor
        )
    {
        return (
            winnerMultiplier,
            loserMultiplier,
            loserAppealPeriodMultiplier,
            MULTIPLIER_DIVISOR
        );
    }

    /**
     * @notice Returns number of possible ruling options. Valid rulings are [0, return value].
     * @return count The number of ruling options.
     */
    function numberOfRulingOptions(
        uint256 /* _arbitrationID */
    ) external pure override returns (uint256) {
        return NUMBER_OF_CHOICES_FOR_ARBITRATOR;
    }

    /**
     * @notice Gets the fee to create a dispute.
     * @return The fee to create a dispute.
     */
    function getDisputeFee(
        bytes32 /* _questionID */
    ) external view override returns (uint256) {
        return arbitrator.arbitrationCost(arbitratorExtraData) + surplusAmount;
    }

    /**
     * @notice Gets the number of rounds of the specific question.
     * @param _arbitrationID The ID of the arbitration related to the question.
     * @return The number of rounds.
     */
    function getNumberOfRounds(
        uint256 _arbitrationID
    ) external view returns (uint256) {
        address requester = arbitrationIDToRequester[_arbitrationID];
        ArbitrationRequest storage arbitration = arbitrationRequests[
            _arbitrationID
        ][requester];
        return arbitration.rounds.length;
    }

    /**
     * @notice Gets the information of a round of a question.
     * @param _arbitrationID The ID of the arbitration.
     * @param _round The round to query.
     * @return paidFees The amount of fees paid for each fully funded answer.
     * @return feeRewards The amount of fees that will be used as rewards.
     * @return fundedAnswers IDs of fully funded answers.
     */
    function getRoundInfo(
        uint256 _arbitrationID,
        uint256 _round
    )
        external
        view
        returns (
            uint256[] memory paidFees,
            uint256 feeRewards,
            uint256[] memory fundedAnswers
        )
    {
        address requester = arbitrationIDToRequester[_arbitrationID];
        ArbitrationRequest storage arbitration = arbitrationRequests[
            _arbitrationID
        ][requester];
        Round storage round = arbitration.rounds[_round];
        fundedAnswers = round.fundedAnswers;

        paidFees = new uint256[](round.fundedAnswers.length);

        for (uint256 i = 0; i < round.fundedAnswers.length; i++) {
            paidFees[i] = round.paidFees[round.fundedAnswers[i]];
        }

        feeRewards = round.feeRewards;
    }

    /**
     * @notice Gets the information of a round of a question for a specific answer choice.
     * @param _arbitrationID The ID of the arbitration.
     * @param _round The round to query.
     * @param _answer The answer choice to get funding status for.
     * @return raised The amount paid for this answer.
     * @return fullyFunded Whether the answer is fully funded or not.
     */
    function getFundingStatus(
        uint256 _arbitrationID,
        uint256 _round,
        uint256 _answer
    ) external view returns (uint256 raised, bool fullyFunded) {
        address requester = arbitrationIDToRequester[_arbitrationID];
        ArbitrationRequest storage arbitration = arbitrationRequests[
            _arbitrationID
        ][requester];
        Round storage round = arbitration.rounds[_round];

        raised = round.paidFees[_answer];
        fullyFunded = round.hasPaid[_answer];
    }

    /**
     * @notice Gets contributions to the answers that are fully funded.
     * @param _arbitrationID The ID of the arbitration.
     * @param _round The round to query.
     * @param _contributor The address whose contributions to query.
     * @return fundedAnswers IDs of the answers that are fully funded.
     * @return contributions The amount contributed to each funded answer by the contributor.
     */
    function getContributionsToSuccessfulFundings(
        uint256 _arbitrationID,
        uint256 _round,
        address _contributor
    )
        external
        view
        returns (uint256[] memory fundedAnswers, uint256[] memory contributions)
    {
        address requester = arbitrationIDToRequester[_arbitrationID];
        ArbitrationRequest storage arbitration = arbitrationRequests[
            _arbitrationID
        ][requester];
        Round storage round = arbitration.rounds[_round];

        fundedAnswers = round.fundedAnswers;
        contributions = new uint256[](round.fundedAnswers.length);

        for (uint256 i = 0; i < contributions.length; i++) {
            contributions[i] = round.contributions[_contributor][
                fundedAnswers[i]
            ];
        }
    }

    /**
     * @notice Returns the sum of withdrawable amount.
     * @dev This function is O(n) where n is the total number of rounds.
     * @dev This could exceed the gas limit, therefore this function should be used only as a utility and not be relied upon by other contracts.
     * @param _arbitrationID The ID of the arbitration.
     * @param _beneficiary The contributor for which to query.
     * @param _contributedTo Answer that received contributions from contributor.
     * @return sum The total amount available to withdraw.
     */
    function getTotalWithdrawableAmount(
        uint256 _arbitrationID,
        address payable _beneficiary,
        uint256 _contributedTo
    ) external view override returns (uint256 sum) {
        address requester = arbitrationIDToRequester[_arbitrationID];
        ArbitrationRequest storage arbitration = arbitrationRequests[
            _arbitrationID
        ][requester];
        if (arbitration.status < Status.Ruled) return sum;

        uint256 finalAnswer = arbitration.answer;
        uint256 noOfRounds = arbitration.rounds.length;
        for (uint256 roundNumber = 0; roundNumber < noOfRounds; roundNumber++) {
            Round storage round = arbitration.rounds[roundNumber];

            if (!round.hasPaid[_contributedTo]) {
                // Allow to reimburse if funding was unsuccessful for this answer option.
                sum += round.contributions[_beneficiary][_contributedTo];
            } else if (!round.hasPaid[finalAnswer]) {
                // Reimburse unspent fees proportionally if the ultimate winner didn't pay appeal fees fully.
                // Note that if only one side is funded it will become a winner and this part of the condition won't be reached.
                sum += round.fundedAnswers.length > 1
                    ? (round.contributions[_beneficiary][_contributedTo] *
                        round.feeRewards) /
                        (round.paidFees[round.fundedAnswers[0]] +
                            round.paidFees[round.fundedAnswers[1]])
                    : 0;
            } else if (finalAnswer == _contributedTo) {
                uint256 paidFees = round.paidFees[_contributedTo];
                // Reward the winner.
                sum += paidFees > 0
                    ? (round.contributions[_beneficiary][_contributedTo] *
                        round.feeRewards) / paidFees
                    : 0;
            }
        }
    }

    /**
     * @notice Casts question ID into uint256 thus returning the related arbitration ID.
     * @param _questionID The ID of the question.
     * @return The ID of the arbitration.
     */
    function questionIDToArbitrationID(
        bytes32 _questionID
    ) external pure returns (uint256) {
        return uint256(_questionID);
    }

    /**
     * @notice Maps external (arbitrator side) dispute id to local (arbitrable) dispute id.
     * @param _externalDisputeID Dispute id as in arbitrator side.
     * @return localDisputeID Dispute id as in arbitrable contract.
     */
    function externalIDtoLocalID(
        uint256 _externalDisputeID
    ) external view override returns (uint256) {
        return disputeIDToDisputeDetails[_externalDisputeID].arbitrationID;
    }
}
