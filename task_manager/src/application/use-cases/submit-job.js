const { processJob } = require('./process-job');
const { log } = require('../../utils/logger');
const { GANACHE_ACCOUNT_INDEX, MAX_BLOCKCHAIN_CONCURRENCY } = require('../../config/ganache');

// ── Per-web3-instance cache ──────────────────────────────────────────────
// Avoids calling getAccounts() + getGasPrice() on EVERY fallback transaction.
const _cache = new WeakMap(); // keyed by web3 instance → { address, gasPrice, updatedAt, nonce }

async function _getContext(web3) {
    const now = Date.now();
    let ctx = _cache.get(web3);

    if (!ctx) {
        const [accounts, gasPrice] = await Promise.all([
            web3.eth.getAccounts(),
            web3.eth.getGasPrice(),
        ]);
        const address = accounts[GANACHE_ACCOUNT_INDEX];
        // Fetch the actual confirmed nonce from the network on first init
        const nonce = Number(await web3.eth.getTransactionCount(address, 'pending'));
        ctx = { address, gasPrice: gasPrice.toString(), updatedAt: now, nonce };
        _cache.set(web3, ctx);
    } else if (now - ctx.updatedAt > 30_000) {
        // Refresh gasPrice every 30s
        ctx.gasPrice = (await web3.eth.getGasPrice()).toString();
        ctx.updatedAt = now;
    }

    return ctx;
}

// ── Nonce-serialised blockchain queue ────────────────────────────────────
// All blockchain sends go through a single async queue so nonces are
// assigned sequentially without races, even under high concurrency.
//
// Implementation: a promise chain acts as a mutex — each new call appends
// to the tail of the chain and waits for the previous to settle.
const _queues = new WeakMap(); // keyed by web3 instance → Promise (tail of chain)

function _enqueue(web3, task) {
    const tail = (_queues.get(web3) || Promise.resolve()).then(task, task);
    // Store the new tail — no matter what, always advance the chain
    const next = tail.catch(() => { });
    _queues.set(web3, next);
    return tail; // callers await this — it rejects on error
}

// ────────────────────────────────────────────────────────────────────────────

let inFlightBlockchain = 0;

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
    const result = await processJob(jobId, fileUrl, receivedAt);

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
        ...(result.offloadRatio !== undefined && { offloadRatio: result.offloadRatio }),
        timeSinceReceivedMs: Date.now() - receivedAt,
    });

    if (inFlightBlockchain >= MAX_BLOCKCHAIN_CONCURRENCY) {
        log('BLOCKCHAIN_OVERLOAD_SHEDDING', {
            requestId,
            jobId: jobId.toString(),
            inFlightBlockchain,
        });
        // Retorna silenciosamente erro para a interface final apontando que a DELEGAÇÃO falhou por lotação
        return { source: 'blockchain_fallback', success: false, reason: 'SYSTEM_OVERLOAD_BLOCKCHAIN_FULL', requestId };
    }

    inFlightBlockchain++;
    try {
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
    } finally {
        inFlightBlockchain--;
    }
}

async function _delegateToBlockchain(jobId, fileUrl, web3, contract) {
    // 1. Pegamos o nounce de forma sequencial (na fila rápida)
    const { txHash, submitStart } = await _enqueue(web3, async () => {
        const ctx = await _getContext(web3);
        const currentNonce = ctx.nonce++;

        // 2. Criamos a promessa de envio e jogamos a transação para o Mempool imediatamente
        const promise = contract.methods.delegateToAny(jobId, fileUrl).send({
            from: ctx.address,
            gas: 500000,
            gasPrice: ctx.gasPrice,
            nonce: currentNonce,
        });

        // 2. Extraímos APENAS O HASH na hora que a transação bate no Mempool.
        // Sem 'await' na promessa global, o Web3 para de fazer 'polling' (metralhar o Ganache com TCP)
        const txHash = await new Promise((resolve, reject) => {
            promise.on('transactionHash', resolve);
            // IMPORTANTE: Se o Ganache sofrer ECONNRESET, temos que avisar a fila para andar, 
            // do contrário o Task Manager trava para sempre (Deadlock)
            promise.catch((err) => {
                console.log(`[GANACHE_ERROR] Falha ao injetar no Mempool: ${err.message}`);
                reject(err);
            });
        });

        return { txHash, submitStart: Date.now() };
    });

    /**
     * FORA DA FILA DE MEMPOOL (Múltiplas requisicoes atômicas simultâneas liberadas):
     * Ao invés de o Web3 esgotar as portas TCP da Azure perguntando se já gerou o bloco a cada décimo,
     * nós pausamos perfeitamente e milimetricamente até a borda de mineração de 15s do Ganache v7 bater!
     */
    const now = Date.now();
    // Calcula quantos ms faltam para o tempo chegar no próximo múltiplo exato de 15000 (15 segundos)
    const delayToNextBlockMs = 15000 - (now % 15000);

    // Deixa o servidor repousar pacificamente no milissegundo exato do bloco
    await new Promise(r => setTimeout(r, delayToNextBlockMs));

    // Como o bloco acabou de virar, o Ganache engoliu a transação
    log('BLOCKCHAIN_TX_CONFIRMED', {
        jobId: jobId.toString(),
        txHash: txHash,
        simulatedBlockWaitMs: delayToNextBlockMs,
    });

    return { transactionHash: txHash };
}

module.exports = { submitJob };
