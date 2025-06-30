// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Voting {
    string[] public candidates;
    mapping(string => uint256) public votes;
    mapping(bytes32 => bool) public isRegisteredVoterIdHash; // voter ID hash registry
    mapping(bytes32 => bool) public hasVoterIdHashVoted;     // tracks if voter ID hash has voted
    mapping(address => bool) public hasAddressVoted;          // tracks if address has voted

    address public owner;

    event VoteCast(bytes32 voterIdHash, string candidate);
    event VoterIdAdded(bytes32 voterIdHash);
    event VoterIdRemoved(bytes32 voterIdHash);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not contract owner");
        _;
    }

    constructor(string[] memory _candidates, string[] memory _voterIds) {
        owner = msg.sender;
        candidates = _candidates;
        for (uint i = 0; i < _voterIds.length; i++) {
            bytes32 hash = keccak256(bytes(_voterIds[i]));
            isRegisteredVoterIdHash[hash] = true;
            emit VoterIdAdded(hash);
        }
    }

    function vote(string memory voterId, string memory _candidate) public {
        bytes32 hash = keccak256(bytes(voterId));
        require(isRegisteredVoterIdHash[hash], "Not a registered voter ID.");
        require(!hasVoterIdHashVoted[hash], "This voter ID has already voted.");
        require(!hasAddressVoted[msg.sender], "This wallet has already voted.");

        // Validate candidate exists
        bool valid = false;
        for (uint i = 0; i < candidates.length; i++) {
            if (keccak256(bytes(candidates[i])) == keccak256(bytes(_candidate))) {
                valid = true;
                break;
            }
        }
        require(valid, "Invalid candidate.");

        votes[_candidate]++;
        hasVoterIdHashVoted[hash] = true;
        hasAddressVoted[msg.sender] = true;
        emit VoteCast(hash, _candidate);
    }

    function getCandidates() public view returns (string[] memory) {
        return candidates;
    }

    function getVotes(string memory _candidate) public view returns (uint256) {
        return votes[_candidate];
    }

    function addVoterId(string memory voterId) public onlyOwner {
        bytes32 hash = keccak256(bytes(voterId));
        require(!isRegisteredVoterIdHash[hash], "Already registered");
        isRegisteredVoterIdHash[hash] = true;
        emit VoterIdAdded(hash);
    }

    function removeVoterId(string memory voterId) public onlyOwner {
        bytes32 hash = keccak256(bytes(voterId));
        require(isRegisteredVoterIdHash[hash], "Not registered");
        isRegisteredVoterIdHash[hash] = false;
        emit VoterIdRemoved(hash);
    }

    function hasVoterIdVotedFn(string memory voterId) public view returns (bool) {
        bytes32 hash = keccak256(bytes(voterId));
        return hasVoterIdHashVoted[hash];
    }

    function isVoterIdRegistered(string memory voterId) public view returns (bool) {
        bytes32 hash = keccak256(bytes(voterId));
        return isRegisteredVoterIdHash[hash];
    }

    function hasAddressVotedFn(address addr) public view returns (bool) {
        return hasAddressVoted[addr];
    }
}