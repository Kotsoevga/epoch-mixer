const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { ethers } = require('ethers');
const circomlibjs = require('circomlibjs');

const ZERO = 0n;
const LEVELS = 20;

function compileContracts() {
  const files = [
    'contracts/EpochMixerZK.sol',
    'contracts/Groth16Verifier.sol',
    'contracts/interfaces/IPoseidonT3.sol',
    'contracts/interfaces/IZKVerifier.sol'
  ];
  const sources = {};
  for (const file of files) sources[file] = { content: fs.readFileSync(file, 'utf8') };

  const input = {
    language: 'Solidity',
    sources,
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }
    }
  };

  function findImports(importPath) {
    let fullPath = path.join(process.cwd(), importPath);
    if (!fs.existsSync(fullPath)) fullPath = path.join(process.cwd(), 'contracts', importPath);
    if (fs.existsSync(fullPath)) return { contents: fs.readFileSync(fullPath, 'utf8') };
    return { error: `Import not found: ${importPath}` };
  }

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  if (output.errors?.some((e) => e.severity === 'error')) {
    for (const e of output.errors) console.error(e.formattedMessage);
    throw new Error('Solidity compilation failed');
  }
  return output.contracts;
}

function poseidonToBigInt(F, x) {
  return BigInt(F.toString(x));
}

function buildSparseRoot(leaves, poseidon, F) {
  const zeros = [ZERO];
  for (let i = 0; i < LEVELS; i++) {
    zeros.push(poseidonToBigInt(F, poseidon([zeros[i], zeros[i]])));
  }

  let layer = leaves.slice();
  for (let level = 0; level < LEVELS; level++) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      const left = layer[i] ?? zeros[level];
      const right = layer[i + 1] ?? zeros[level];
      next.push(poseidonToBigInt(F, poseidon([left, right])));
    }
    if (next.length === 0) next.push(zeros[level + 1]);
    layer = next;
  }
  return layer[0];
}

async function main() {
  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const deployerKey =
    process.env.PRIVATE_KEY ||
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
  const depositorKey =
    process.env.DEPOSITOR_PRIVATE_KEY ||
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
  const deployer = new ethers.NonceManager(new ethers.Wallet(deployerKey, provider));
  const depositor = new ethers.NonceManager(new ethers.Wallet(depositorKey, provider));
  const contracts = compileContracts();

  const poseidonFactory = new ethers.ContractFactory(
    circomlibjs.poseidonContract.generateABI(2),
    circomlibjs.poseidonContract.createCode(2),
    deployer
  );
  const poseidon2 = await poseidonFactory.deploy();
  await poseidon2.waitForDeployment();

  const verifierContract = contracts['contracts/Groth16Verifier.sol'].Groth16Verifier;
  const verifier = await new ethers.ContractFactory(
    verifierContract.abi,
    '0x' + verifierContract.evm.bytecode.object,
    deployer
  ).deploy();
  await verifier.waitForDeployment();

  const mixerContract = contracts['contracts/EpochMixerZK.sol'].EpochMixerZK;
  const mixer = await new ethers.ContractFactory(
    mixerContract.abi,
    '0x' + mixerContract.evm.bytecode.object,
    deployer
  ).deploy(ethers.parseEther('1'), 30, await verifier.getAddress(), await poseidon2.getAddress());
  await mixer.waitForDeployment();

  const poseidon = await circomlibjs.buildPoseidon();
  const F = poseidon.F;
  const leaves = [];

  for (let i = 0; i < 3; i++) {
    const commitment = poseidonToBigInt(F, poseidon([100n + BigInt(i), 200n + BigInt(i)]));
    leaves.push(commitment);
    await (await mixer.connect(depositor).deposit(commitment.toString(), { value: ethers.parseEther('1') })).wait();

    const localRoot = buildSparseRoot(leaves, poseidon, F);
    const onChainRoot = BigInt(await mixer.epochCurrentRoot(0));
    if (localRoot !== onChainRoot) throw new Error(`root mismatch after deposit ${i}`);
  }
  console.log('OK: on-chain Merkle root matches local root after deposits');

  let closeCurrentRejected = false;
  try {
    await (await mixer.connect(depositor).closeEpoch(0, { gasLimit: 500000 })).wait();
  } catch (_) {
    closeCurrentRejected = true;
  }
  if (!closeCurrentRejected) throw new Error('closing current epoch should be rejected');
  console.log('OK: closing active interval is rejected');

  const genesis = Number(await mixer.genesisTime());
  await provider.send('evm_setNextBlockTimestamp', [genesis + 31]);
  await provider.send('evm_mine', []);

  await (await mixer.connect(depositor).closeEpoch(0, { gasLimit: 500000 })).wait();
  const fixedRoot = BigInt(await mixer.epochRoot(0));
  const localRoot = buildSparseRoot(leaves, poseidon, F);
  if (fixedRoot !== localRoot) throw new Error('fixed root mismatch');
  console.log('OK: completed interval can be closed by non-deployer with contract-computed root');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
