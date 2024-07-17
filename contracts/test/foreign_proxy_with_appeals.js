const { ethers } = require("hardhat");

const { time } = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const { toBigInt, ZeroAddress, zeroPadValue, toBeHex } = ethers;

const arbitratorExtraData = "0x85";
const arbitrationCost = 1000;
const initialBond = 2000;
const appealCost = 5000;
const questionID = zeroPadValue(toBeHex(0), 32);
const answer = zeroPadValue(toBeHex(11), 32);
const arbitrationID = 0;
const l2GasPrice = 100;
const surplusAmount = 20000; // Covers the gas price
const totalCost = 21000; // Arbitration cost + surplus

const L2_GAS_LIMIT = 1500000;
const L2_GAS_PER_PUB_DATA_BYTE_LIMIT = 800;
const l2BlockNumber = 15012;
const messageIndex = 1;
const l2TxNumberInBlock = 9;
const proof = [zeroPadValue(toBeHex(11), 32)];

const appealTimeOut = 180;
const winnerMultiplier = 3000;
const loserMultiplier = 7000;
const loserAppealPeriodMultiplier = 5000;
const gasPrice = 80000000;
const MAX_ANSWER =
    "115792089237316195423570985008687907853269984665640564039457584007913129639935";
const maxPrevious = 2001;

const metaEvidence = "ipfs/X";
const metadata = "ipfs/Y";
const foreignChainId = 5;
const oneETH = 1e18;

const ZERO_HASH = zeroPadValue(toBeHex(0), 32);

let arbitrator;
let homeProxy;
let foreignProxy;
let realitio;
let mockMessenger;

let governor;
let requester;
let crowdfunder1;
let crowdfunder2;
let answerer;
let other;

describe("Cross-chain arbitration with appeals", () => {
    beforeEach("initialize the contract", async function() {
        [governor, requester, crowdfunder1, crowdfunder2, answerer, other] =
        await ethers.getSigners();
        ({ arbitrator, realitio, foreignProxy, homeProxy, mockMessenger } =
            await deployContracts(governor));
        // Create disputes so the index in tests will not be a default value.
        await arbitrator
            .connect(other)
            .createDispute(42, arbitratorExtraData, { value: arbitrationCost });
        await arbitrator
            .connect(other)
            .createDispute(4, arbitratorExtraData, { value: arbitrationCost });
        await realitio.setArbitrator(arbitrator.target);
        await realitio.connect(requester).askQuestion("text");
        await realitio
            .connect(answerer)
            .submitAnswer(questionID, answer, initialBond, { value: initialBond });
    });

    it("Should correctly set the initial values", async() => {
        expect(await foreignProxy.governor()).to.equal(governor.address);
        expect(await foreignProxy.arbitrator()).to.equal(arbitrator.target);
        expect(await foreignProxy.MESSENGER()).to.equal(mockMessenger.target);
        expect(await foreignProxy.arbitratorExtraData()).to.equal(
            arbitratorExtraData
        );

        expect(await foreignProxy.surplusAmount()).to.equal(20000);
        expect(await foreignProxy.metaEvidenceUpdates()).to.equal(0);
        expect(await foreignProxy.homeProxy()).to.equal(homeProxy.target);

        expect(await homeProxy.metadata()).to.equal(metadata);
        expect(await homeProxy.foreignChainId()).to.equal(
            zeroPadValue(toBeHex(5), 32)
        );
        expect(await homeProxy.foreignProxy()).to.equal(foreignProxy.target);
        expect(await homeProxy.MESSENGER()).to.equal(mockMessenger.target);
        expect(await homeProxy.realitio()).to.equal(realitio.target);

        // 0 - winner, 1 - loser, 2 - loserAppealPeriod.
        const multipliers = await foreignProxy.getMultipliers();
        expect(multipliers[0]).to.equal(3000);
        expect(multipliers[1]).to.equal(7000);
        expect(multipliers[2]).to.equal(5000);
    });

    it("Check governance requires", async() => {
        await expect(
            foreignProxy.connect(other).changeMessenger(ZeroAddress)
        ).to.be.revertedWith("The caller must be the governor.");
        await foreignProxy.connect(governor).changeMessenger(homeProxy.target);
        expect(await foreignProxy.MESSENGER()).to.equal(homeProxy.target);

        await expect(
            foreignProxy.connect(other).changeArbitrator(ZeroAddress, "0xff")
        ).to.be.revertedWith("The caller must be the governor.");
        await foreignProxy.connect(governor).changeArbitrator(ZeroAddress, "0xff");
        expect(await foreignProxy.arbitrator()).to.equal(ZeroAddress);
        expect(await foreignProxy.arbitratorExtraData()).to.equal("0xff");

        await expect(
            foreignProxy.connect(other).changeMetaevidence("ME2.0")
        ).to.be.revertedWith("The caller must be the governor.");
        await foreignProxy.connect(governor).changeMetaevidence("ME2.0");
        expect(await foreignProxy.metaEvidenceUpdates()).to.equal(1);

        await expect(
            foreignProxy.connect(other).changeSurplus(3333)
        ).to.be.revertedWith("The caller must be the governor.");
        await foreignProxy.connect(governor).changeSurplus(3333);
        expect(await foreignProxy.surplusAmount()).to.equal(3333);

        await expect(
            foreignProxy.connect(other).changeHomeProxy(ZeroAddress)
        ).to.be.revertedWith("The caller must be the governor.");
        await foreignProxy.connect(governor).changeHomeProxy(ZeroAddress);
        expect(await foreignProxy.homeProxy()).to.equal(ZeroAddress);

        await expect(
            foreignProxy.connect(other).changeWinnerMultiplier(51)
        ).to.be.revertedWith("The caller must be the governor.");
        await foreignProxy.connect(governor).changeWinnerMultiplier(51);
        expect(await foreignProxy.winnerMultiplier()).to.equal(51);

        await expect(
            foreignProxy.connect(other).changeGovernor(other.address)
        ).to.be.revertedWith("The caller must be the governor.");
        await foreignProxy.connect(governor).changeGovernor(other.address);
        expect(await foreignProxy.governor()).to.equal(other.address);

        // Governor is changed from now on
        // other.address is governor

        await expect(
            foreignProxy.connect(governor).changeLoserMultiplier(25)
        ).to.be.revertedWith("The caller must be the governor.");
        await foreignProxy.connect(other).changeLoserMultiplier(25);
        expect(await foreignProxy.loserMultiplier()).to.equal(25);

        await expect(
            foreignProxy.connect(governor).changeLoserAppealPeriodMultiplier(777)
        ).to.be.revertedWith("The caller must be the governor.");
        await foreignProxy.connect(other).changeLoserAppealPeriodMultiplier(777);
        expect(await foreignProxy.loserAppealPeriodMultiplier()).to.equal(777);
    });

    it("Should set correct values when requesting arbitration and fire the event", async() => {
        await expect(
            foreignProxy
            .connect(requester)
            .requestArbitration(questionID, maxPrevious, { value: arbitrationCost })
        ).to.be.revertedWith("Deposit value too low");

        const requesterAddress = await requester.getAddress();
        await expect(
                foreignProxy
                .connect(requester)
                .requestArbitration(questionID, maxPrevious, { value: totalCost })
            )
            .to.emit(foreignProxy, "ArbitrationRequested")
            .withArgs(questionID, requesterAddress, maxPrevious);

        const arbitration = await foreignProxy.arbitrationRequests(
            arbitrationID,
            await requester.getAddress()
        );

        expect(arbitration[0]).to.equal(
            1,
            "Incorrect status of the arbitration after creating a request"
        );
        expect(arbitration[1]).to.equal(1000, "Deposit value stored incorrectly"); // Surplus (20000) + ArbCost (1000) - ArbitrumFee (10000 + 5*500).

        const request = await homeProxy.requests(questionID, requesterAddress);
        expect(request[0]).to.equal(
            2,
            "Incorrect status of the request in HomeProxy"
        );
        expect(request[1]).to.equal(ZERO_HASH, "Answer should be empty");

        expect(await homeProxy.questionIDToRequester(questionID)).to.equal(
            requesterAddress,
            "Incorrect requester stored in home proxy"
        );
    });

    it("Should not allow to request arbitration 2nd time", async() => {
        await foreignProxy
            .connect(requester)
            .requestArbitration(questionID, maxPrevious, { value: totalCost });

        await expect(
            foreignProxy
            .connect(requester)
            .requestArbitration(questionID, maxPrevious, { value: totalCost })
        ).to.be.revertedWith("Arbitration already requested");
    });

    it("Check home proxy permissions", async() => {
        await expect(
            homeProxy.receiveArbitrationRequest(
                questionID,
                await requester.getAddress(),
                maxPrevious
            )
        ).to.be.revertedWith("Can only be called by foreign proxy");

        await expect(
            homeProxy.receiveArbitrationFailure(
                questionID,
                await requester.getAddress()
            )
        ).to.be.revertedWith("Can only be called by foreign proxy");

        await expect(
            homeProxy.receiveArbitrationAnswer(questionID, answer)
        ).to.be.revertedWith("Can only be called by foreign proxy");
    });

    it("Check foreign proxy permissions", async() => {
        await expect(
            foreignProxy.receiveArbitrationAcknowledgement(
                questionID,
                await requester.getAddress()
            )
        ).to.be.revertedWith("NOT_BRIDGE");

        await expect(
            foreignProxy.receiveArbitrationCancelation(
                questionID,
                await requester.getAddress()
            )
        ).to.be.revertedWith("NOT_BRIDGE");
    });

    it("Should set correct values when acknowledging arbitration and create a dispute", async() => {
        await foreignProxy
            .connect(requester)
            .requestArbitration(questionID, maxPrevious, { value: totalCost });

        const badMessage = "0xfa";
        await expect(
            mockMessenger.connect(other).sendMessage(homeProxy.target, badMessage, 0)
        ).to.be.revertedWith("Failed TxToL1");

        await expect(
                homeProxy
                .connect(other)
                .handleNotifiedRequest(questionID, await requester.getAddress())
            )
            .to.emit(homeProxy, "RequestAcknowledged")
            .withArgs(questionID, await requester.getAddress())
            .to.emit(arbitrator, "DisputeCreation")
            .withArgs(2, foreignProxy.target)
            .to.emit(foreignProxy, "ArbitrationCreated")
            .withArgs(questionID, await requester.getAddress(), 2)
            .to.emit(foreignProxy, "Dispute")
            .withArgs(arbitrator.target, 2, 0, 0);

        const request = await homeProxy.requests(
            questionID,
            await requester.getAddress()
        );
        expect(request[0]).to.equal(
            3,
            "Incorrect status of the request in HomeProxy"
        );

        const arbitration = await foreignProxy.arbitrationRequests(
            arbitrationID,
            await requester.getAddress()
        );
        expect(arbitration[0]).to.equal(
            2,
            "Incorrect status of the arbitration after acknowledging arbitration"
        );
        expect(arbitration[1]).to.equal(0, "Deposit value should be empty");
        expect(arbitration[2]).to.equal(2, "Incorrect dispute ID");

        const disputeData = await foreignProxy.arbitratorDisputeIDToDisputeDetails(
            arbitrator.address,
            2
        );
        expect(disputeData[0]).to.equal(
            0,
            "Incorrect arbitration ID in disputeData"
        );
        expect(disputeData[1]).to.equal(
            await requester.getAddress(),
            "Incorrect requester address in disputeData"
        );

        expect(await foreignProxy.arbitrationIDToRequester(arbitrationID)).to.equal(
            await requester.getAddress(),
            "Incorrect requester address in the mapping"
        );
        expect(
            await foreignProxy.arbitrationIDToDisputeExists(arbitrationID)
        ).to.equal(true, "Incorrect flag after creating a dispute");

        expect(await foreignProxy.getNumberOfRounds(arbitrationID)).to.equal(
            1,
            "Incorrect number of rounds after dispute creation"
        );
        expect(await foreignProxy.externalIDtoLocalID(2)).to.equal(
            arbitrationID,
            "Incorrect externalIDtoLocalID value"
        );

        const dispute = await arbitrator.disputes(2);
        expect(dispute[0]).to.equal(
            foreignProxy.target,
            "Incorrect arbitrable address"
        );
        expect(dispute[1]).to.equal(MAX_ANSWER, "Incorrect number of choices");
        expect(dispute[2]).to.equal(1000, "Incorrect fees value stored");
    });

    it("Should not allow to receive the message from incorrect L2 sender", async() => {
        await foreignProxy
            .connect(requester)
            .requestArbitration(questionID, maxPrevious, { value: totalCost });

        // Deliberately change homeProxy address i.e. sender to see if the check in onlyL2Bridge modifier works.
        // Note that it want obtain the exact message during revert because of low level call
        await mockMessenger.setHomeProxy(await other.getAddress());

        await expect(
            homeProxy
            .connect(other)
            .handleNotifiedRequest(questionID, await requester.getAddress())
        ).to.be.revertedWith("Failed TxToL1");
    });

    it("Should not be able to proccess the message twice", async() => {
        await foreignProxy
            .connect(requester)
            .requestArbitration(questionID, maxPrevious, { value: totalCost });

        await homeProxy.handleNotifiedRequest(
            questionID,
            await requester.getAddress()
        );

        await expect(
            foreignProxy
            .connect(requester)
            .requestArbitration(questionID, maxPrevious, { value: totalCost })
        ).to.be.revertedWith("Dispute already created");
    });

    it("Should correctly submit evidence", async() => {
        await foreignProxy
            .connect(requester)
            .requestArbitration(questionID, maxPrevious, { value: totalCost });

        await homeProxy.handleNotifiedRequest(
            questionID,
            await requester.getAddress()
        );

        // Setup 2nd arbitrator and check how questions with different status handle it.
        const Arbitrator = await ethers.getContractFactory(
            "AutoAppealableArbitrator",
            governor
        );
        const arbitrator2 = await Arbitrator.deploy(String(arbitrationCost));
        await foreignProxy.changeArbitrator(
            arbitrator2.target,
            arbitratorExtraData
        );

        // Should use old arbitrator
        await expect(
                foreignProxy.connect(other).submitEvidence(arbitrationID, "text")
            )
            .to.emit(foreignProxy, "Evidence")
            .withArgs(
                arbitrator.target,
                arbitrationID,
                await other.getAddress(),
                "text"
            );

        // Use arbitration ID with None status. Should use new arbitrator
        await expect(foreignProxy.connect(other).submitEvidence(1, "text2"))
            .to.emit(foreignProxy, "Evidence")
            .withArgs(arbitrator2.target, 1, await other.getAddress(), "text2");
    });

    async function deployContracts(signer) {
        const Arbitrator = await ethers.getContractFactory(
            "AutoAppealableArbitrator",
            signer
        );

        const arbitrator = await Arbitrator.deploy(String(arbitrationCost));

        const Realitio = await ethers.getContractFactory("MockRealitio", signer);
        const realitio = await Realitio.deploy();

        const MockMessenger = await ethers.getContractFactory(
            "MockCrossDomainMessenger",
            signer
        );
        const mockMessenger = await MockMessenger.deploy();

        const ForeignProxy = await ethers.getContractFactory(
            "RealitioForeignProxyRedStone",
            signer
        );
        const HomeProxy = await ethers.getContractFactory(
            "RealitioHomeProxyRedStone",
            signer
        );

        const address = await signer.getAddress();
        const nonce = await signer.getNonce();

        const transaction = {
            from: address,
            nonce: nonce + 1, // Add 1 since homeProxy deployment will be after foreignProxy
        };

        const homeProxyAddress = ethers.getCreateAddress(transaction);

        const foreignProxy = await ForeignProxy.deploy(
            mockMessenger.target,
            homeProxyAddress,
            signer.address,
            arbitrator.target,
            arbitratorExtraData,
            surplusAmount,
            metaEvidence, [winnerMultiplier, loserMultiplier, loserAppealPeriodMultiplier]
        );

        const homeProxy = await HomeProxy.deploy(
            realitio.target,
            foreignChainId,
            foreignProxy.target,
            metadata,
            mockMessenger.target,
            mockMessenger.target
        );

        await mockMessenger.setHomeProxy(homeProxy.target);

        return {
            arbitrator,
            realitio,
            foreignProxy,
            homeProxy,
            mockMessenger,
        };
    }
});