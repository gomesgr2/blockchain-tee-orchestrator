const RoundRobin = require('../domain/round-robin');
const { updateTeeLatency, getAvailableTEEs, getOffloadRatio } = require('../domain/status-manager');
const { sendJobToTEE } = require('../../infrastructure/tee');
const { getFileByUrl } = require('../../infrastructure/storage');


const TEE_IPS = process.env.TEE_IPS ? process.env.TEE_IPS.split(',') : ['localhost:9090'];
const rr = new RoundRobin(TEE_IPS);

/**
 * Attempts to process a job locally on an available TEE node.
 *
 * When a TEE is degraded, jobs are stochastically redirected to the blockchain
 * proportional to its current offloadRatio (0.0 = all local, 1.0 = all blockchain).
 *
 * Returns { success: true, result } on success.
 * Returns { success: false, reason, offloadRatio? } on failure/offload,
 * letting submit-job trigger the blockchain fallback.
 *
 * @param {string|bigint} jobId
 * @param {string} fileUrl
 * @param {number} receivedAt - Timestamp de quando a requisição chegou no Express
 * @returns {Promise<{ success: boolean, result?: string, reason?: string, offloadRatio?: number }>}
 */
async function processJob(jobId, fileUrl, receivedAt) {
    const availableTEEs = getAvailableTEEs();
    rr.updateTargets(availableTEEs);
    const targetTEE = rr.getNext();

    if (!targetTEE) {
        return { success: false, reason: 'NO_AVAILABLE_TEE' };
    }

    // ── Gradual offload decision ──────────────────────────────────────────
    const offloadRatio = getOffloadRatio(targetTEE);
    if (offloadRatio > 0 && Math.random() < offloadRatio) {
        console.log(
            `[TRAFFIC-MANAGER] Job ${jobId} redirected to blockchain ` +
            `(TEE ${targetTEE} offloadRatio=${(offloadRatio * 100).toFixed(0)}%)`
        );
        return { success: false, reason: 'GRADUAL_OFFLOAD', offloadRatio };
    }

    // ── Local TEE processing ──────────────────────────────────────────────
    try {
        const pdfBuffer = await getFileByUrl(fileUrl);
        const result = await sendJobToTEE(targetTEE, 9090, jobId, pdfBuffer);

        // A latência que alimenta o algoritmo de offload agora conta:
        // Transporte Express + Fila Local do Node + Download do PDF + Processamento + Retorno
        const totalDuration = Date.now() - receivedAt;

        updateTeeLatency(targetTEE, totalDuration, true);
        return { success: true, result };
    } catch (error) {
        updateTeeLatency(targetTEE, 0, false);
        return { success: false, reason: error.message || 'TEE_ERROR' };
    }
}

module.exports = { processJob };
