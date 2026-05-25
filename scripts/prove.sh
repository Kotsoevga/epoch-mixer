#!/usr/bin/env bash
set -euo pipefail

INPUT=${1:-build/input.json}
if [ ! -f "$INPUT" ]; then
  echo "Input file $INPUT not found"
  exit 1
fi

node build/main_js/generate_witness.js build/main.wasm "$INPUT" build/witness.wtns
snarkjs groth16 prove build/main_final.zkey build/witness.wtns build/proof.json build/public.json
snarkjs groth16 verify build/verification_key.json build/public.json build/proof.json

echo "Proof generated and verified successfully"
