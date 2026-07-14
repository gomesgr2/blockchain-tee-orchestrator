const fs = require('fs');
const path = require('path');
const { web3, contract } = require('../infrastructure/blockchain');
const { log } = require('../utils/logger');
const { GANACHE_POLLING_INTERVAL, GANACHE_ACCOUNT_INDEX } = require('../config/ganache');
const { processJob } = require('../application/use-cases/process-job');

// ── Blockchain Latency CSV ─────────────────────────────────────────────────
// Written to OUTPUT_DIR (default: /app/output inside the container, or ./output locally).
// Columns:
//   jobId           — same ID sent by benchmark.js (join key)
//   txHash          — blockchain transaction hash (secondary join key)
//   blockNumber     — block where the event was mined
//   capturedAt      — unix ms when the event was detected by the poller
//   processingMs    — time (ms) to run the job on the local TEE after capture
//   totalWorkflowMs — capturedAt → job complete (includes TEE processing)
//   success         — whether processJob succeeded

const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(process.cwd(), 'output');
const CSV_PATH = path.join(OUTPUT_DIR, 'blockchain_latencies.csv');
const CSV_HEADER = 'jobId,txHash,blockNumber,capturedAt,processingMs,totalWorkflowMs,success\n';

function initCsv() {
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    // Write header only if the file doesn't exist yet (supports restarts / append)
    if (!fs.existsSync(CSV_PATH)) {
        fs.writeFileSync(CSV_PATH, CSV_HEADER);
        console.log(`[LISTENER] blockchain_latencies.csv initialised at ${CSV_PATH}`);
    }
}

function appendCsvRow(row) {
    const line = [
        row.jobId,
        row.txHash,
        row.blockNumber,
        row.capturedAt,
        row.processingMs,
        row.totalWorkflowMs,
        row.success,
    ].join(',') + '\n';
    fs.appendFileSync(CSV_PATH, line);
}

// ── Listener ───────────────────────────────────────────────────────────────

const blockchainProcessedJobs = new Set();

async function blockchainListener() {
    initCsv();

    const accounts = await web3.eth.getAccounts();
    const taskManagerAddress = accounts[GANACHE_ACCOUNT_INDEX];

    log("LISTENER_STARTED", { manager: taskManagerAddress, csvPath: CSV_PATH });
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
                    const txHash = event.transactionHash || 'N/A';
                    const blockNumber = Number(event.blockNumber);

                    if (blockchainProcessedJobs.has(jobId.toString())) continue;
                    blockchainProcessedJobs.add(jobId.toString());

                    log("BLOCKCHAIN_EVENT_CAPTURED", {
                        jobId,
                        blockNumber,
                        capturedAt: captureTime
                    });

                    const start = Date.now();
                    const result = await processJob(jobId, fileUrl);
                    const end = Date.now();

                    const processingMs = end - start;
                    const totalWorkflowMs = end - captureTime;
                    const success = result.success;

                    log("BLOCKCHAIN_JOB_PROCESSED", {
                        jobId,
                        txHash,
                        processingMs,
                        totalWorkflowMs,
                        success,
                    });

                    appendCsvRow({
                        jobId: jobId.toString(),
                        txHash,
                        blockNumber,
                        capturedAt: captureTime,
                        processingMs,
                        totalWorkflowMs,
                        success,
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
