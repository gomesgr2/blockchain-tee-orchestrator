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

/**
 * Converte qualquer valor de jobId em BigInt de forma segura.
 * Aceita números inteiros, strings numéricas e strings mistas (ex: "4-0-warmup").
 */
function parseJobId(raw) {
    if (raw === undefined || raw === null) return BigInt(0);
    const s = String(raw).trim();
    // Se for puramente numérico, converte diretamente
    if (/^\d+$/.test(s)) return BigInt(s);
    // Extrai apenas os dígitos da string (ex: "4-0-warmup" → "40")
    const digits = s.replace(/\D/g, '');
    if (digits.length > 0) return BigInt(digits);
    // Último fallback: usa o hash numérico da string
    let hash = 0n;
    for (const c of s) hash = (hash * 31n + BigInt(c.charCodeAt(0))) & 0xFFFFFFFFFFFFFFFFn;
    return hash;
}

app.post('/submit', async (req, res) => {
    const { fileUrl } = req.body;
    const jobId = parseJobId(req.body.jobId);
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