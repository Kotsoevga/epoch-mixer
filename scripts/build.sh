#!/usr/bin/env bash
set -euo pipefail

mkdir -p build
circom circuits/main.circom --r1cs --wasm --sym -o build

if [ ! -f pot14_final.ptau ]; then
  snarkjs powersoftau new bn128 14 pot14_0000.ptau -v
  snarkjs powersoftau contribute pot14_0000.ptau pot14_0001.ptau --name="init" -v -e="epoch-zk-demo"
  snarkjs powersoftau prepare phase2 pot14_0001.ptau pot14_final.ptau -v
fi

snarkjs groth16 setup build/main.r1cs pot14_final.ptau build/main_0000.zkey
snarkjs zkey contribute build/main_0000.zkey build/main_final.zkey --name="contrib" -v -e="epoch-zk-demo"
snarkjs zkey export verificationkey build/main_final.zkey build/verification_key.json
snarkjs zkey export solidityverifier build/main_final.zkey contracts/Groth16Verifier.sol

echo "Build finished. Artifacts are in ./build and verifier is in contracts/Groth16Verifier.sol"
