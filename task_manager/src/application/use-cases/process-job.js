const RoundRobin = require('../domain/round-robin');
const { updateTeeLatency, getAvailableTEEs } = require('../domain/status-manager');
const { sendJobToTEE } = require('../../infrastructure/tee');
const { getFileByUrl } = require('../../infrastructure/storage');


const TEE_IPS = process.env.TEE_IPS ? process.env.TEE_IPS.split(',') : ['localhost:9090'];
const rr = new RoundRobin(TEE_IPS);

/**
 * Attempts to process a job locally on an available TEE node.
 *
 * Returns { success: true, result } on success.
 * Returns { success: false, reason } on failure — letting the caller
 * (submit-job use case) decide whether to trigger the blockchain fallback.
 *
 * @param {string|bigint} jobId
 * @param {string} fileUrl
 * @returns {Promise<{ success: boolean, result?: string, reason?: string }>}
 */
async function processJob(jobId, fileUrl) {
    const availableTEEs = getAvailableTEEs();
    rr.updateTargets(availableTEEs);
    const targetTEE = rr.getNext();

    if (!targetTEE) {
        return { success: false, reason: 'NO_AVAILABLE_TEE' };
    }

    try {
        const pdfBuffer = await getFileByUrl(fileUrl);
        const startReq = Date.now();
        const result = await sendJobToTEE(targetTEE, 9090, jobId, pdfBuffer);
        const durationReq = Date.now() - startReq;
        updateTeeLatency(targetTEE, durationReq, true);
        return { success: true, result };
    } catch (error) {
        updateTeeLatency(targetTEE, 0, false);
        return { success: false, reason: error.message || 'TEE_ERROR' };
    }
}

module.exports = { processJob };
