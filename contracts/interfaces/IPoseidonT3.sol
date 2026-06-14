pragma solidity ^0.8.24;

interface IPoseidonT3 {
    function poseidon(uint256[2] calldata input) external view returns (uint256);
}
