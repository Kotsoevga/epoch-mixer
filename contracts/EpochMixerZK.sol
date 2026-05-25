pragma solidity ^0.8.24;

import "./interfaces/IZKVerifier.sol";

contract EpochMixerZK {
    uint256 public immutable denomination;
    uint256 public immutable epochLength;
    uint256 public immutable genesisTime;
    address public immutable owner;
    IZKVerifier public immutable verifier;

    mapping(uint256 => uint256[]) private epochCommitments;
    mapping(uint256 => bool) public epochClosed;
    mapping(uint256 => uint256) public epochRoot;
    mapping(uint256 => bool) public nullifierSpent;

    event Deposited(address indexed sender, uint256 indexed epochId, uint256 commitment, uint256 indexInEpoch);
    event EpochClosed(uint256 indexed epochId, uint256 root);
    event Withdrawn(address indexed to, uint256 indexed epochId, uint256 nullifierHash);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor(uint256 _denomination, uint256 _epochLength, address _verifier) {
        require(_denomination > 0, "denomination=0");
        require(_epochLength >= 30, "epoch too small");
        require(_verifier != address(0), "verifier=0");
        denomination = _denomination;
        epochLength = _epochLength;
        verifier = IZKVerifier(_verifier);
        genesisTime = block.timestamp;
        owner = msg.sender;
    }

    function currentEpoch() public view returns (uint256) {
        return (block.timestamp - genesisTime) / epochLength;
    }

    function deposit(uint256 commitment) external payable {
        require(msg.value == denomination, "bad amount");
        require(commitment != 0, "commitment=0");

        uint256 epochId = currentEpoch();
        require(!epochClosed[epochId], "epoch closed");

        epochCommitments[epochId].push(commitment);
        emit Deposited(msg.sender, epochId, commitment, epochCommitments[epochId].length - 1);
    }

    function closeEpoch(uint256 epochId, uint256 root) external onlyOwner {
        require(epochId <= currentEpoch(), "can close only current/past epoch");
        require(!epochClosed[epochId], "already closed");
        require(root != 0, "root=0");
        epochClosed[epochId] = true;
        epochRoot[epochId] = root;
        emit EpochClosed(epochId, root);
    }

    function withdraw(
        address payable to,
        uint256 epochId,
        uint256 nullifierHash,
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c
    ) external {
        require(to != address(0), "to=0");
        require(epochClosed[epochId], "epoch not closed");
        require(!nullifierSpent[nullifierHash], "spent");

        uint256 root = epochRoot[epochId];
        require(root != 0, "root not set");

        uint256[3] memory publicInputs = [root, nullifierHash, uint256(uint160(address(to)))];
        require(verifier.verifyProof(a, b, c, publicInputs), "invalid proof");

        nullifierSpent[nullifierHash] = true;
        (bool ok, ) = to.call{value: denomination}("");
        require(ok, "transfer failed");

        emit Withdrawn(to, epochId, nullifierHash);
    }

    function epochSize(uint256 epochId) external view returns (uint256) {
        return epochCommitments[epochId].length;
    }

    function getCommitment(uint256 epochId, uint256 index) external view returns (uint256) {
        return epochCommitments[epochId][index];
    }
}
