pragma solidity ^0.8.24;

contract BaselineMixer {
    uint256 public immutable denomination;
    bytes32[] public commitments;
    mapping(bytes32 => bool) public nullifierSpent;

    event Deposited(address indexed sender, bytes32 commitment, uint256 index);
    event Withdrawn(address indexed to, bytes32 nullifier);

    constructor(uint256 _denomination) {
        require(_denomination > 0, "denomination=0");
        denomination = _denomination;
    }

    function deposit(bytes32 commitment) external payable {
        require(msg.value == denomination, "bad amount");
        require(commitment != bytes32(0), "commitment=0");
        commitments.push(commitment);
        emit Deposited(msg.sender, commitment, commitments.length - 1);
    }

    function withdraw(
        address payable to,
        bytes32 secret,
        bytes32 randomness,
        uint256 index
    ) external {
        require(to != address(0), "to=0");
        require(index < commitments.length, "bad index");

        bytes32 commitment = keccak256(abi.encodePacked(secret, randomness));
        require(commitments[index] == commitment, "not member");

        bytes32 nullifier = keccak256(abi.encodePacked(secret));
        require(!nullifierSpent[nullifier], "spent");
        nullifierSpent[nullifier] = true;

        (bool ok, ) = to.call{value: denomination}("");
        require(ok, "transfer failed");
        emit Withdrawn(to, nullifier);
    }

    function commitmentCount() external view returns (uint256) {
        return commitments.length;
    }
}
