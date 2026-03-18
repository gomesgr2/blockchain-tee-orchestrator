const RoundRobin = require('./roundRobin');
const { updateTeeLatency, getAvailableTEEs } = require('./statusManager');
const { sendJobToTEE } = require('./tee');
const axios = require('axios');
const TEE_IPS = process.env.TEE_IPS ? process.env.TEE_IPS.split(',') : ['localhost:9090'];
const rr = new RoundRobin(TEE_IPS);


async function processJob(jobId, fileUrl) {
    const targetTEES = getAvailableTEEs();
    rr.updateTargets(targetTEES);
    const targetTEE = rr.getNext();

    if (targetTEE) {
        try {
            const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
            const pdfBuffer = Buffer.from(response.data);
            const startReq = Date.now();
            const result = await sendJobToTEE(targetTEE, 9090, jobId, pdfBuffer);
            const durationReq = Date.now() - startReq;
            updateTeeLatency(targetTEE, durationReq, true);
            return { result, success: true };
        } catch (error) {
            console.error("Erro no processamento local, tentando fallback...", JSON.stringify(error));
            updateTeeLatency(targetTEE, 0, false);
            return { success: false };
        }
    }

    return { success: false };
}

module.exports = { processJob };
