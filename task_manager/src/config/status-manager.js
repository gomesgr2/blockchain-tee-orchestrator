const ALL_TEEs = process.env.TEE_IPS ? process.env.TEE_IPS.split(',') : ['tee-1', 'tee-2'];
const LATENCY_THRESHOLD = process.env.LATENCY_THRESHOLD || 40000;
const WINDOW_SIZE = process.env.WINDOW_SIZE || 10;
const COOLDOWN_MS = process.env.COOLDOWN_MS || 15000;
const TEE_CHECK_INTERVAL = process.env.TEE_CHECK_INTERVAL || 5000;
module.exports = {
    LATENCY_THRESHOLD,
    WINDOW_SIZE,
    COOLDOWN_MS,
    ALL_TEEs,
    TEE_CHECK_INTERVAL
}