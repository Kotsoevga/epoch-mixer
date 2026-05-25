pragma circom 2.1.6;

include "mixer.circom";

component main {public [root, nullifierHash, recipient]} = Mixer(20);
