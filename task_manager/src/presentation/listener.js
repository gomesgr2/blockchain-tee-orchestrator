const { web3, contract } = require('../infrastructure/blockchain');
const { log } = require('../utils/logger');
const { GANACHE_POLLING_INTERVAL, GANACHE_ACCOUNT_INDEX } = require('../config/ganache');
const { processJob } = require('../application/use-cases/process-job');


const blockchainProcessedJobs = new Set();
async function blockchainListener() {
    const accounts = await web3.eth.getAccounts();
    const taskManagerAddress = accounts[GANACHE_ACCOUNT_INDEX];

    log("LISTENER_STARTED", { manager: taskManagerAddress });
    let lastBlockChecked = await web3.eth.getBlockNumber();

    setInterval(async () => {
        try {
            const currentBlock = await web3.eth.getBlockNumber();
            if (currentBlock > lastBlockChecked) {
                const events = await contract.getPastEvents('JobDelegated', {
                    filter: { targetManager: taskManagerAddress },
                    fromBlock: lastBlockChecked + 1n,
                    toBlock: currentBlock
                });

                for (const event of events) {
                    const { jobId, fileUrl } = event.returnValues;
                    const captureTime = Date.now();

                    if (blockchainProcessedJobs.has(jobId.toString())) continue;
                    blockchainProcessedJobs.add(jobId.toString());

                    log("BLOCKCHAIN_EVENT_CAPTURED", {
                        jobId,
                        blockNumber: Number(event.blockNumber),
                        capturedAt: captureTime
                    });

                    const start = Date.now();
                    await processJob(jobId, fileUrl);
                    const end = Date.now();

                    log("BLOCKCHAIN_JOB_PROCESSED", {
                        jobId,
                        processingTimeMs: end - start,
                        totalWorkflowTimeMs: end - captureTime // Tempo desde a detecção até o fim
                    });
                }
                lastBlockChecked = currentBlock;
            }
        } catch (err) {
            log("POLLING_ERROR", { error: err.message });
        }
    }, GANACHE_POLLING_INTERVAL);
}

module.exports = {
    blockchainListener
}
