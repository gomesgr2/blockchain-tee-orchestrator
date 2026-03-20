require('dotenv').config();
const { app, blockchainListener } = require('./presentation');
const { web3, contract } = require('./infrastructure/blockchain');
const { log } = require('./utils/logger');
const { registerManager } = require('./application/use-cases/register-manager');

async function startApp() {
    let connected = false;
    log("BLOCKCHAIN_CONNECT_WAITING");

    while (!connected) {
        try {
            const tx = await registerManager(web3, contract);
            if (tx.status) {
                log("MANAGER_REGISTERED", {
                    blockNumber: tx.blockNumber
                });
                connected = true;
            }
        } catch {
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    app.listen(3000, () => {
        log("SERVER_STARTED", { port: 3000 });
        blockchainListener();
    });
}

startApp();