const fs = require('fs');
const { ethers } = require('ethers');

async function main() {
  const cfg = JSON.parse(fs.readFileSync(process.argv[2] || 'build/demo-note.json', 'utf8'));
  const rpcUrl = cfg.rpcUrl || 'http://127.0.0.1:8545';
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(cfg.closePrivateKey || cfg.privateKey || process.env.PRIVATE_KEY, provider);

  if (!cfg.closePrivateKey && !cfg.privateKey && !process.env.PRIVATE_KEY) {
    throw new Error('Private key is required: set cfg.closePrivateKey, cfg.privateKey or PRIVATE_KEY');
  }

  const abi = [
    'function currentEpoch() view returns (uint256)',
    'function closeEpoch(uint256 epochId)',
    'function epochRoot(uint256 epochId) view returns (uint256)',
    'event EpochClosed(uint256 indexed epochId,uint256 root)'
  ];
  const mixer = new ethers.Contract(cfg.mixer, abi, signer);

  const currentEpoch = BigInt(await mixer.currentEpoch());
  const epochId = cfg.epochId !== undefined ? BigInt(cfg.epochId) : currentEpoch - 1n;

  if (epochId >= currentEpoch) {
    throw new Error(`Epoch ${epochId} is not finished yet. currentEpoch=${currentEpoch}`);
  }

  const tx = await mixer.closeEpoch(epochId, { gasLimit: 500000 });
  const receipt = await tx.wait();
  const root = BigInt(await mixer.epochRoot(epochId)).toString();

  console.log('Epoch closed:', epochId.toString());
  console.log('Fixed root:', root);
  console.log('Tx:', receipt.hash);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
