const { Web3 } = require('web3');
const fs = require('fs');
const path = require('path');

const GANACHE_RPC = process.env.GANACHE_RPC || 'http://localhost:8545';
const MAX_RETRIES = 20;
const RETRY_DELAY_MS = 3000;

async function waitForGanache(web3) {
    for (let i = 1; i <= MAX_RETRIES; i++) {
        try {
            await web3.eth.getBlockNumber();
            console.log('✅ Ganache is ready.');
            return;
        } catch {
            console.log(`⏳ Ganache not ready yet (attempt ${i}/${MAX_RETRIES}). Retrying in ${RETRY_DELAY_MS / 1000}s...`);
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        }
    }
    throw new Error('❌ Ganache did not become ready in time.');
}

async function deploy() {
    const web3 = new Web3(GANACHE_RPC);

    await waitForGanache(web3);

    const jsonPath = path.resolve(process.cwd(), process.argv[2] || './smartContract.json');
    console.log(`🔍 Loading contract from: ${jsonPath}`);

    if (!fs.existsSync(jsonPath)) {
        console.error(`❌ File not found: ${jsonPath}`);
        process.exit(1);
    }

    const contractData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const contractKey = Object.keys(contractData.contracts)
        .find(k => k.includes('smartContract')) || Object.keys(contractData.contracts)[0];

    const abi = contractData.contracts[contractKey].abi;
    const bytecode = '0x' + contractData.contracts[contractKey].bin;

    const accounts = await web3.eth.getAccounts();
    const deployer = accounts[0];
    console.log(`🚀 Deploying from: ${deployer}`);

    const myContract = new web3.eth.Contract(abi);
    const instance = await myContract.deploy({ data: bytecode }).send({
        from: deployer,
        gas: 4700000,
        gasPrice: '20000000000',
    });

    console.log(`\nDEPLOY_SUCCESS`);
    console.log(`CONTRACT_ADDRESS=${instance.options.address}`);
}

deploy().catch(err => {
    console.error('DEPLOY FAILED:', err.message);
    process.exit(1);
});
