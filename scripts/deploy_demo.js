const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { ethers } = require('ethers');
const circomlibjs = require('circomlibjs');

function compileContracts() {
  const files = [
    'contracts/EpochMixerZK.sol',
    'contracts/Groth16Verifier.sol',
    'contracts/interfaces/IPoseidonT3.sol',
    'contracts/interfaces/IZKVerifier.sol'
  ];
  const sources = {};
  for (const file of files) {
    sources[file] = { content: fs.readFileSync(file, 'utf8') };
  }

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
  if (output.errors) {
    for (const err of output.errors) {
      if (err.severity === 'error') console.error(err.formattedMessage);
    }
  }
  if (output.errors?.some((err) => err.severity === 'error')) {
    throw new Error('Solidity compilation failed');
  }
  return output.contracts;
}

async function main() {
  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error('Set PRIVATE_KEY for deployer');

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.NonceManager(new ethers.Wallet(privateKey, provider));

  const denomination = process.env.DENOMINATION_WEI || ethers.parseEther('1');
  const epochLength = process.env.EPOCH_LENGTH || 30;

  const contracts = compileContracts();

  const poseidonFactory = new ethers.ContractFactory(
    circomlibjs.poseidonContract.generateABI(2),
    circomlibjs.poseidonContract.createCode(2),
    signer
  );
  const poseidon2 = await poseidonFactory.deploy();
  await poseidon2.waitForDeployment();

  const verifierContract = contracts['contracts/Groth16Verifier.sol'].Groth16Verifier;
  const verifier = await new ethers.ContractFactory(
    verifierContract.abi,
    '0x' + verifierContract.evm.bytecode.object,
    signer
  ).deploy();
  await verifier.waitForDeployment();

  const mixerContract = contracts['contracts/EpochMixerZK.sol'].EpochMixerZK;
  const mixer = await new ethers.ContractFactory(
    mixerContract.abi,
    '0x' + mixerContract.evm.bytecode.object,
    signer
  ).deploy(denomination, epochLength, await verifier.getAddress(), await poseidon2.getAddress());
  await mixer.waitForDeployment();

  console.log('Deployer        :', await signer.getAddress());
  console.log('PoseidonT3      :', await poseidon2.getAddress());
  console.log('Groth16Verifier :', await verifier.getAddress());
  console.log('EpochMixerZK    :', await mixer.getAddress());
  console.log('Genesis time    :', (await mixer.genesisTime()).toString());
  console.log('Epoch length    :', (await mixer.epochLength()).toString());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
