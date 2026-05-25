const fs = require('fs');
const { ethers } = require('ethers');

async function main() {
  const cfg = JSON.parse(fs.readFileSync(process.argv[2] || 'build/withdraw-config.json', 'utf8'));
  const proof = JSON.parse(fs.readFileSync('build/proof.json', 'utf8'));
  const publicSignals = JSON.parse(fs.readFileSync('build/public.json', 'utf8'));

  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl || 'http://127.0.0.1:8545');
  const signer = new ethers.Wallet(cfg.privateKey, provider);

  const a = proof.pi_a.slice(0, 2).map((x) => BigInt(x).toString());
  const b = [
    [BigInt(proof.pi_b[0][1]).toString(), BigInt(proof.pi_b[0][0]).toString()],
    [BigInt(proof.pi_b[1][1]).toString(), BigInt(proof.pi_b[1][0]).toString()]
  ];
  const c = proof.pi_c.slice(0, 2).map((x) => BigInt(x).toString());

  const root = BigInt(publicSignals[0]).toString();
  const nullifierHash = BigInt(publicSignals[1]).toString();
  const recipient = ethers.getAddress(cfg.recipientAddress);
  const expectedRecipientField = BigInt(publicSignals[2]).toString();
  if (expectedRecipientField !== BigInt(recipient).toString()) {
    throw new Error('Recipient address does not match public input from proof');
  }

  const abi = [
    'function epochRoot(uint256) view returns (uint256)',
    'function withdraw(address payable to,uint256 epochId,uint256 nullifierHash,uint256[2] calldata a,uint256[2][2] calldata b,uint256[2] calldata c)'
  ];
  const mixer = new ethers.Contract(cfg.mixer, abi, signer);
  const onChainRoot = BigInt(await mixer.epochRoot(cfg.epochId)).toString();
  if (onChainRoot !== root) {
    throw new Error(`On-chain root ${onChainRoot} differs from proof root ${root}`);
  }

  const tx = await mixer.withdraw(recipient, cfg.epochId, nullifierHash, a, b, c);
  await tx.wait();
  console.log('Withdrawal succeeded. Nullifier hash:', nullifierHash);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
