pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../contracts/EpochMixerZK.sol";
import "../contracts/Groth16Verifier.sol";

contract DeployAndCloseZk is Script {
    uint256 constant DENOM = 1 ether;
    uint256 constant EPOCH_LEN = 3600;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address poseidon2 = vm.envAddress("POSEIDON2");

        vm.startBroadcast(deployerKey);
        Groth16Verifier verifier = new Groth16Verifier();
        EpochMixerZK mixer = new EpochMixerZK(DENOM, EPOCH_LEN, address(verifier), poseidon2);
        vm.stopBroadcast();

        console.log("PoseidonT3      :", poseidon2);
        console.log("Groth16Verifier :", address(verifier));
        console.log("EpochMixerZK    :", address(mixer));
        console.log("Genesis time    :", mixer.genesisTime());
    }
}
