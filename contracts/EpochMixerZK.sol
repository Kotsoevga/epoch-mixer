pragma solidity ^0.8.24;

import "./interfaces/IZKVerifier.sol";
import "./interfaces/IPoseidonT3.sol";

contract EpochMixerZK {
    uint256 public constant FIELD_SIZE =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint8 public constant TREE_LEVELS = 20;
    uint256 public constant MAX_LEAVES = 1 << TREE_LEVELS;

    uint256 public immutable denomination;
    uint256 public immutable epochLength;
    uint256 public immutable genesisTime;
    IZKVerifier public immutable verifier;
    IPoseidonT3 public immutable poseidon2;

    mapping(uint256 => uint256[]) private epochCommitments;
    mapping(uint256 => bool) public epochClosed;
    mapping(uint256 => uint256) public epochRoot;
    mapping(uint256 => uint256) public epochCurrentRoot;
    mapping(uint256 => uint256) public epochNextIndex;
    mapping(uint256 => bool) public nullifierSpent;

    uint256[TREE_LEVELS] public zeros;
    mapping(uint256 => mapping(uint8 => uint256)) private epochFilledSubtrees;

    event Deposited(
        address indexed sender,
        uint256 indexed epochId,
        uint256 commitment,
        uint256 indexInEpoch,
        uint256 currentRoot
    );
    event EpochClosed(uint256 indexed epochId, uint256 root);
    event Withdrawn(address indexed to, uint256 indexed epochId, uint256 nullifierHash);


    constructor(
        uint256 _denomination,
        uint256 _epochLength,
        address _verifier,
        address _poseidon2
    ) {
        require(_denomination > 0, "denomination=0");
        require(_epochLength >= 30, "epoch too small");
        require(_verifier != address(0), "verifier=0");
        require(_poseidon2 != address(0), "poseidon=0");

        denomination = _denomination;
        epochLength = _epochLength;
        verifier = IZKVerifier(_verifier);
        poseidon2 = IPoseidonT3(_poseidon2);
        genesisTime = block.timestamp;
        zeros[0] = 0;
        for (uint8 i = 1; i < TREE_LEVELS; i++) {
            zeros[i] = _hashPair(zeros[i - 1], zeros[i - 1]);
        }
    }

    function currentEpoch() public view returns (uint256) {
        return (block.timestamp - genesisTime) / epochLength;
    }

    function deposit(uint256 commitment) external payable {
        require(msg.value == denomination, "bad amount");
        require(commitment != 0, "commitment=0");
        require(commitment < FIELD_SIZE, "commitment>=field");

        uint256 epochId = currentEpoch();
        require(!epochClosed[epochId], "epoch closed");

        uint256 index = epochNextIndex[epochId];
        require(index < MAX_LEAVES, "tree full");

        uint256 newRoot = _insertLeaf(epochId, index, commitment);

        epochCommitments[epochId].push(commitment);
        epochNextIndex[epochId] = index + 1;
        epochCurrentRoot[epochId] = newRoot;

        emit Deposited(msg.sender, epochId, commitment, index, newRoot);
    }

    function closeEpoch(uint256 epochId) external {
        require(epochId < currentEpoch(), "epoch not finished");
        require(!epochClosed[epochId], "already closed");
        require(epochNextIndex[epochId] > 0, "empty epoch");

        uint256 root = epochCurrentRoot[epochId];
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

    function getFilledSubtree(uint256 epochId, uint8 level) external view returns (uint256) {
        require(level < TREE_LEVELS, "bad level");
        return epochFilledSubtrees[epochId][level];
    }

    function zeroRoot() external view returns (uint256) {
        return _zeroRoot();
    }

    function _insertLeaf(
        uint256 epochId,
        uint256 index,
        uint256 leaf
    ) internal returns (uint256 currentHash) {
        currentHash = leaf;
        uint256 currentIndex = index;

        for (uint8 level = 0; level < TREE_LEVELS; level++) {
            uint256 left;
            uint256 right;

            if (currentIndex % 2 == 0) {
                left = currentHash;
                right = zeros[level];
                epochFilledSubtrees[epochId][level] = currentHash;
            } else {
                left = epochFilledSubtrees[epochId][level];
                right = currentHash;
            }

            currentHash = _hashPair(left, right);
            currentIndex /= 2;
        }
    }

    function _hashPair(uint256 left, uint256 right) internal view returns (uint256) {
        require(left < FIELD_SIZE, "left>=field");
        require(right < FIELD_SIZE, "right>=field");
        return poseidon2.poseidon([left, right]);
    }

    function _zeroRoot() internal view returns (uint256 currentHash) {
        currentHash = zeros[TREE_LEVELS - 1];
        currentHash = _hashPair(currentHash, currentHash);
    }
}
