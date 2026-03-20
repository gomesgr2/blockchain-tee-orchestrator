const { GANACHE_RPC, CONTRACT_ADDRESS, CONTRACT_ABI } = require('../config/ganache');
const { Web3 } = require('web3');

// transactionBlockTimeout: how many blocks Web3 waits before giving up on a tx.
// Default is 50 — too low under high RPS. Set to 500 to handle Ganache congestion.
// transactionPollingInterval: how often (ms) Web3 polls for receipt. Default 1000ms.
const web3 = new Web3(
    new Web3.providers.HttpProvider(GANACHE_RPC, { keepAlive: true }),
    undefined,
    {
        transactionBlockTimeout: 500,
        transactionPollingInterval: 1000,  // ms
    }
);

const contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);

module.exports = { web3, contract };
