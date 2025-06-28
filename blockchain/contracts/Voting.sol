// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Voting {
    string[] public candidates;
    mapping(string => uint256) public votes;
    mapping(address => bool) public hasVoted;

    event VoteCast(address indexed voter, string candidate);

    constructor(string[] memory _candidates) {
        candidates = _candidates;
    }

    function vote(string memory _candidate) public {
        require(!hasVoted[msg.sender], "You already voted.");

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
        hasVoted[msg.sender] = true;
        emit VoteCast(msg.sender, _candidate);
    }

    function getCandidates() public view returns (string[] memory) {
        return candidates;
    }

    function getVotes(string memory _candidate) public view returns (uint256) {
        return votes[_candidate];
    }
}