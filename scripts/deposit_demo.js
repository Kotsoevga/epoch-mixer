const fs = require('fs');
const { ethers } = require('ethers');
const circomlibjs = require('circomlibjs');

const PRIME = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
const toField = (v) => BigInt(v) % PRIME;

async function main() {
  const configPath = process.argv[2] || 'build/demo-config.json';
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  const provider = new ethers.JsonRpcProvider(cfg.rpcUrl || 'http://127.0.0.1:8545');
  const signer = new ethers.Wallet(cfg.privateKey, provider);

  const poseidon = await circomlibjs.buildPoseidon();
  const F = poseidon.F;

  const secret = toField(cfg.secret);
  const randomness = toField(cfg.randomness);
  const commitment = BigInt(F.toString(poseidon([secret, randomness])));

  const abi = ['function deposit(uint256 commitment) payable'];
  const mixer = new ethers.Contract(cfg.mixer, abi, signer);

  const tx = await mixer.deposit(commitment.toString(), {
    value: cfg.denominationWei || ethers.parseEther('1')
  });
  await tx.wait();

  fs.mkdirSync('build', { recursive: true });
  fs.writeFileSync(
    'build/demo-note.json',
    JSON.stringify(
      {
        rpcUrl: cfg.rpcUrl || 'http://127.0.0.1:8545',
        mixer: cfg.mixer,
        epochId: cfg.epochId || 0,
        secret: secret.toString(),
        randomness: randomness.toString(),
        recipient: cfg.recipient,
        commitment: commitment.toString()
      },
      null,
      2
    )
  );

  console.log('Deposit sent. Commitment:', commitment.toString());
  console.log('Note saved to build/demo-note.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
