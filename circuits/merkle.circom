pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";

template MerkleInclusionProof(nLevels) {
    signal input leaf;
    signal input pathElements[nLevels];
    signal input pathIndices[nLevels];
    signal output root;

    signal hashes[nLevels + 1];
    signal left[nLevels];
    signal right[nLevels];
    component h[nLevels];

    hashes[0] <== leaf;

    for (var i = 0; i < nLevels; i++) {
        h[i] = Poseidon(2);

        pathIndices[i] * (pathIndices[i] - 1) === 0;

        left[i] <== hashes[i] + pathIndices[i] * (pathElements[i] - hashes[i]);
        right[i] <== pathElements[i] + pathIndices[i] * (hashes[i] - pathElements[i]);

        h[i].inputs[0] <== left[i];
        h[i].inputs[1] <== right[i];

        hashes[i + 1] <== h[i].out;
    }

    root <== hashes[nLevels];
}
