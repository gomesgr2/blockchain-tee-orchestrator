const { processJob } = require('./process-job');
const { log } = require('../../utils/logger');
const { GANACHE_ACCOUNT_INDEX } = require('../../config/ganache');

// ── Per-web3-instance cache ──────────────────────────────────────────────
// Avoids calling getAccounts() + getGasPrice() on EVERY fallback transaction,
// which serialises requests and adds latency under high RPS.
const _cache = new WeakMap(); // keyed by web3 instance → { address, gasPrice, updatedAt }

async function _getContext(web3) {
    const now = Date.now();
    let ctx = _cache.get(web3);

    // Refresh gasPrice every 30s; address is stable for the lifecycle of the process
    if (!ctx || now - ctx.updatedAt > 30_000) {
        const [accounts, gasPrice] = await Promise.all([
            ctx ? Promise.resolve([ctx.address]) : web3.eth.getAccounts(),
            web3.eth.getGasPrice(),
        ]);
        ctx = { address: accounts[GANACHE_ACCOUNT_INDEX], gasPrice: gasPrice.toString(), updatedAt: now };
        _cache.set(web3, ctx);
    }
    return ctx;
}

// ────────────────────────────────────────────────────────────────────────────

async function submitJob(jobId, fileUrl, requestId, web3, contract) {
    const receivedAt = Date.now();

    log('REQUEST_RECEIVED', {
        requestId,
        jobId: jobId.toString(),
        fileUrl,
        timestamp: receivedAt,
    });

    // ── 1. Try local TEE processing ──────────────────────────────────────
    const startProcessing = Date.now();
    const result = await processJob(jobId, fileUrl);

    if (result.success) {
        log('ACK_LOCAL', {
            requestId,
            jobId: jobId.toString(),
            totalLatencyMs: Date.now() - receivedAt,
            pureProcessingTimeMs: Date.now() - startProcessing,
            source: 'local',
        });

        return { source: 'local', requestId };
    }

    // ── 2. Fallback: delegate via blockchain ─────────────────────────────
    log('FALLBACK_TRIGGERED', {
        requestId,
        jobId: jobId.toString(),
        reason: result.reason || 'NO_AVAILABLE_TEE',
        timeSinceReceivedMs: Date.now() - receivedAt,
    });

    const tx = await _delegateToBlockchain(jobId, fileUrl, web3, contract);

    log('ACK_BLOCKCHAIN', {
        requestId,
        jobId: jobId.toString(),
        txHash: tx.transactionHash,
        totalLatencyUntilOffloadMs: Date.now() - receivedAt,
    });

    return {
        source: 'blockchain_fallback',
        requestId,
        txHash: tx.transactionHash,
    };
}

async function _delegateToBlockchain(jobId, fileUrl, web3, contract) {
    const { address, gasPrice } = await _getContext(web3);
    const submitStart = Date.now();

    const tx = await contract.methods.delegateToAny(jobId, fileUrl).send({
        from: address,
        gas: 500000,
        gasPrice,
    });

    log('BLOCKCHAIN_TX_CONFIRMED', {
        jobId: jobId.toString(),
        txHash: tx.transactionHash,
        blockNumber: Number(tx.blockNumber),
        miningLatencyMs: Date.now() - submitStart,
    });

    return tx;
}

module.exports = { submitJob };

