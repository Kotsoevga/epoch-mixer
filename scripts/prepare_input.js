const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const circomlibjs = require('circomlibjs');

const PRIME = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
const ZERO = 0n;
const LEVELS = 20;

function toField(v) {
  return BigInt(v) % PRIME;
}

function poseidonToBigInt(F, x) {
  return BigInt(F.toString(x));
}

function buildZeroValues(poseidon, F) {
  const zeros = [ZERO];
  for (let level = 0; level < LEVELS; level++) {
    zeros.push(poseidonToBigInt(F, poseidon([zeros[level], zeros[level]])));
  }
  return zeros;
}

function buildSparseTree(leaves, poseidon, F) {
  const zeros = buildZeroValues(poseidon, F);
  const layers = [leaves.slice()];

  for (let level = 0; level < LEVELS; level++) {
    const prev = layers[level];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      const left = prev[i] ?? zeros[level];
      const right = prev[i + 1] ?? zeros[level];
      next.push(poseidonToBigInt(F, poseidon([left, right])));
    }
    if (next.length === 0) next.push(zeros[level + 1]);
    layers.push(next);
  }

  return { layers, zeros };
}

function buildPath(layers, zeros, index) {
  const pathElements = [];
  const pathIndices = [];
  let idx = index;

  for (let level = 0; level < LEVELS; level++) {
    const siblingIndex = idx ^ 1;
    const layer = layers[level];
    const sibling = siblingIndex < layer.length ? layer[siblingIndex] : zeros[level];
    pathElements.push(sibling.toString());
    pathIndices.push(idx & 1);
    idx = Math.floor(idx / 2);
  }
  return { pathElements, pathIndices };
}

async function main() {
  const configPath = process.argv[2] || 'build/demo-note.json';
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  const provider = new ethers.JsonRpcProvider(config.rpcUrl || 'http://127.0.0.1:8545');
  const abi = [
    'function epochSize(uint256) view returns (uint256)',
    'function getCommitment(uint256,uint256) view returns (uint256)',
    'function epochRoot(uint256) view returns (uint256)',
    'function epochCurrentRoot(uint256) view returns (uint256)'
  ];
  const mixer = new ethers.Contract(config.mixer, abi, provider);

  const poseidon = await circomlibjs.buildPoseidon();
  const F = poseidon.F;

  const secret = toField(config.secret);
  const randomness = toField(config.randomness);
  const localCommitment = poseidonToBigInt(F, poseidon([secret, randomness]));

  const epochId = Number(config.epochId);
  const size = Number(await mixer.epochSize(epochId));
  const leaves = [];
  let leafIndex = -1;

  for (let i = 0; i < size; i++) {
    const c = BigInt(await mixer.getCommitment(epochId, i));
    leaves.push(c);
    if (c === localCommitment) leafIndex = i;
  }

  if (leafIndex === -1) {
    throw new Error('Commitment from demo-note.json was not found in the selected epoch');
  }

  const { layers, zeros } = buildSparseTree(leaves, poseidon, F);
  const root = layers[LEVELS][0];

  const closedRoot = BigInt(await mixer.epochRoot(epochId));
  const currentRoot = BigInt(await mixer.epochCurrentRoot(epochId));
  if (closedRoot !== ZERO && closedRoot !== root) {
    throw new Error(`On-chain closed root ${closedRoot} differs from locally computed root ${root}`);
  }
  if (closedRoot === ZERO && currentRoot !== ZERO && currentRoot !== root) {
    throw new Error(`On-chain current root ${currentRoot} differs from locally computed root ${root}`);
  }

  const nullifierHash = poseidonToBigInt(F, poseidon([secret]));
  const recipient = BigInt(config.recipient);
  const pathData = buildPath(layers, zeros, leafIndex);

  const input = {
    root: root.toString(),
    nullifierHash: nullifierHash.toString(),
    recipient: recipient.toString(),
    secret: secret.toString(),
    randomness: randomness.toString(),
    pathElements: pathData.pathElements,
    pathIndices: pathData.pathIndices
  };

  fs.mkdirSync(path.dirname('build/input.json'), { recursive: true });
  fs.writeFileSync('build/input.json', JSON.stringify(input, null, 2));
  fs.writeFileSync(
    'build/tree.json',
    JSON.stringify(
      {
        epochId,
        root: root.toString(),
        onChainClosedRoot: closedRoot.toString(),
        onChainCurrentRoot: currentRoot.toString(),
        leafIndex,
        leaves: leaves.map(String)
      },
      null,
      2
    )
  );

  console.log('Input prepared: build/input.json');
  console.log('Epoch root   :', root.toString());
  console.log('Leaf index   :', leafIndex);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
