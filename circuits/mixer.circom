pragma circom 2.1.6;

include "merkle.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

template Mixer(nLevels) {
    signal input root;
    signal input nullifierHash;
    signal input recipient;

    signal input secret;
    signal input randomness;
    signal input pathElements[nLevels];
    signal input pathIndices[nLevels];

    component cm = Poseidon(2);
    cm.inputs[0] <== secret;
    cm.inputs[1] <== randomness;
    signal commitment <== cm.out;

    component merkle = MerkleInclusionProof(nLevels);
    merkle.leaf <== commitment;
    for (var i = 0; i < nLevels; i++) {
        merkle.pathElements[i] <== pathElements[i];
        merkle.pathIndices[i] <== pathIndices[i];
    }
    root === merkle.root;

    component nh = Poseidon(1);
    nh.inputs[0] <== secret;
    nullifierHash === nh.out;

    component recipientBits = Num2Bits(160);
    recipientBits.in <== recipient;

    component nonZeroSecret = Num2Bits(248);
    nonZeroSecret.in <== secret;
}
