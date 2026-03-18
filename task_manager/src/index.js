const express = require('express');
const { Web3 } = require('web3');
const crypto = require('crypto');
require('dotenv').config();

const compiled = require('./smartContract.json');
const { processJob } = require('./jobProcessor');
// Supondo que seu logger use winston ou similar para saída JSON
const { log, logger } = require('./logger');

const app = express();
app.use(express.json());

// Middleware de Identificação e Auditoria
app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    req.receivedAt = Date.now(); // Timestamp de entrada (T2)
    next();
});

// Configurações do ambiente
const GANACHE_RPC = process.env.GANACHE_RPC || 'http://localhost:8545';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const CONTRACT_ABI = compiled.contracts['smartContract.sol:smartContract'].abi;

const web3 = new Web3(new Web3.providers.HttpProvider(GANACHE_RPC, { keepAlive: true }));
const contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
const PORT = 3000;
let taskManagerAddress;

// Cache para evitar re-processamento
const blockchainProcessedJobs = new Set();

/**
 * Função auxiliar para capturar o "estado" do Task Manager no log
 */
function getSystemContext() {
    return {
        pendingJobs: blockchainProcessedJobs.size,
    };
}

// ------------------------------------------------------
// BLOCKCHAIN SUBMIT (LOGS DE PERSISTÊNCIA)
// ------------------------------------------------------
async function submitJobToBlockchain(fileUrl, jobId, requestId) {
    const submitStart = Date.now();
    const legacyGasPrice = await web3.eth.getGasPrice();

    const tx = await contract.methods.delegateToAny(jobId, fileUrl).send({
        from: taskManagerAddress,
        gas: 500000,
        gasPrice: legacyGasPrice.toString()
    });

    const confirmationTime = Date.now();

    log("BLOCKCHAIN_TX_CONFIRMED", {
        requestId,
        jobId,
        txHash: tx.transactionHash,
        blockNumber: Number(tx.blockNumber),
        miningLatencyMs: confirmationTime - submitStart, // Tempo que a blockchain levou
        context: getSystemContext()
    });

    return tx;
}

// ------------------------------------------------------
// SUBMIT ENDPOINT
// ------------------------------------------------------
app.post('/submit', async (req, res) => {
    const { fileUrl } = req.body;
    const jobId = BigInt(req.body.jobId);
    const requestId = req.requestId;

    log("REQUEST_RECEIVED", {
        requestId,
        jobId: jobId.toString(),
        fileUrl,
        timestamp: req.receivedAt
    });

    const startProcessing = Date.now();

    try {
        // Tenta processar localmente (dentro da TEE vinculada)
        const result = await processJob(jobId, fileUrl);

        if (result.success) {
            const endProcessing = Date.now();

            log("ACK_LOCAL", {
                requestId,
                jobId: jobId.toString(),
                totalLatencyMs: endProcessing - req.receivedAt,
                pureProcessingTimeMs: endProcessing - startProcessing,
                source: 'local'
            });

            return res.json({ source: 'local', requestId });
        }

        // Se falhar (ex: TEE ocupada/erro), dispara Fallback
        log("FALLBACK_TRIGGERED", {
            requestId,
            jobId: jobId.toString(),
            reason: result.reason || "OVERLOAD",
            timeSinceReceivedMs: Date.now() - req.receivedAt
        });

        const tx = await submitJobToBlockchain(fileUrl, jobId, requestId);

        const finalAckTime = Date.now();
        log("ACK_BLOCKCHAIN", {
            requestId,
            jobId: jobId.toString(),
            txHash: tx.transactionHash,
            totalLatencyUntilOffloadMs: finalAckTime - req.receivedAt
        });

        return res.json({
            source: 'blockchain_fallback',
            requestId,
            txHash: tx.transactionHash
        });

    } catch (err) {
        log("REQUEST_ERROR", {
            requestId,
            jobId: jobId.toString(),
            error: err.message
        });
        return res.status(500).json({ error: "Internal Error", requestId });
    }
});

// ------------------------------------------------------
// LISTENER (LOGS DE CAPTURA DO SEGUNDO TASK MANAGER)
// ------------------------------------------------------
async function initListener() {
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
    }, 2000);
}

// ------------------------------------------------------
// START APP
// ------------------------------------------------------
async function startApp() {

    let connected = false;

    log("BLOCKCHAIN_CONNECT_WAITING");

    while (!connected) {

        try {

            const accounts = await web3.eth.getAccounts();
            const legacyGasPrice = await web3.eth.getGasPrice();

            taskManagerAddress =
                accounts[process.env.ACCOUNT_INDEX || 0];

            const tx = await contract.methods.registerManager().send({
                from: taskManagerAddress,
                gas: '200000',
                gasPrice: legacyGasPrice.toString()
            });

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

    app.listen(PORT, () => {
        log("SERVER_STARTED", { port: PORT });
        initListener();
    });
}

startApp();
