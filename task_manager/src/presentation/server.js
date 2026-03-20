const express = require('express');
const crypto = require('crypto');

const { submitJob } = require('../application/use-cases/submit-job');
const { web3, contract } = require('../infrastructure/blockchain');
const { log } = require('../utils/logger');

const app = express();
app.use(express.json());

// ── Middleware: attach requestId and receivedAt to every request ──────────
app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    req.receivedAt = Date.now();
    next();
});

// ── POST /submit ──────────────────────────────────────────────────────────
// Thin HTTP adapter: parse input, call the use case, map result to response.
app.post('/submit', async (req, res) => {
    const { fileUrl } = req.body;
    const jobId = BigInt(req.body.jobId);
    const { requestId } = req;

    try {
        const result = await submitJob(jobId, fileUrl, requestId, web3, contract);
        return res.json(result);
    } catch (err) {
        log('REQUEST_ERROR', { requestId, jobId: jobId.toString(), error: err.message });
        return res.status(500).json({ error: 'Internal Error', requestId });
    }
});

module.exports = { app };