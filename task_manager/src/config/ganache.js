const compiled = require('./smartContract.json');

const GANACHE_RPC = process.env.GANACHE_RPC || 'http://localhost:8545';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const CONTRACT_ABI = compiled.contracts['smartContract.sol:smartContract'].abi;
const GANACHE_POLLING_INTERVAL = 2000;
const GANACHE_ACCOUNT_INDEX = process.env.ACCOUNT_INDEX || 0;

module.exports = {
    GANACHE_RPC,
    CONTRACT_ADDRESS,
    CONTRACT_ABI,
    GANACHE_POLLING_INTERVAL,
    GANACHE_ACCOUNT_INDEX
}
