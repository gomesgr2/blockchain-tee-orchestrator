const RoundRobin = require('../domain/round-robin');
const { getAvailableTEEs, shouldOffload } = require('../domain/status-manager');
const { sendJobToTEE } = require('../../infrastructure/tee');
const { getFileByUrl } = require('../../infrastructure/storage');


const TEE_IPS = process.env.TEE_IPS ? process.env.TEE_IPS.split(',') : ['localhost:9090'];
const rr = new RoundRobin(TEE_IPS);

/**
 * Attempts to process a job locally on an available TEE node.
 *
 * Jobs are deterministically redirected to the blockchain based on the
 * global OFFLOAD_PERCENTAGE.
 *
 * Returns { success: true, result } on success.
 * Returns { success: false, reason } on failure/offload,
 * letting submit-job trigger the blockchain fallback.
 *
 * @param {string|bigint} jobId
 * @param {string} fileUrl
 * @param {number} receivedAt - Timestamp de quando a requisição chegou no Express
 * @returns {Promise<{ success: boolean, result?: string, reason?: string }>}
 */
async function processJob(jobId, fileUrl, receivedAt) {
    const availableTEEs = getAvailableTEEs();
    rr.updateTargets(availableTEEs);
    const targetTEE = rr.getNext();

    if (!targetTEE) {
        return { success: false, reason: 'NO_AVAILABLE_TEE' };
    }

    // ── Deterministic percentage offload decision ────────────────────────
    if (shouldOffload()) {
        console.log(
            `[TRAFFIC-MANAGER] Job ${jobId} redirected to blockchain ` +
            `(deterministic offload)`
        );
        return { success: false, reason: 'DETERMINISTIC_OFFLOAD' };
    }

    // ── Local TEE processing ──────────────────────────────────────────────
    try {
        const pdfBuffer = await getFileByUrl(fileUrl);
        const result = await sendJobToTEE(targetTEE, 9090, jobId, pdfBuffer);

        return { success: true, result };
    } catch (error) {
        return { success: false, reason: error.message || 'TEE_ERROR' };
    }
}

module.exports = { processJob };
