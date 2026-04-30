const ALL_TEEs = process.env.TEE_IPS ? process.env.TEE_IPS.split(',') : ['tee-1', 'tee-2'];

// Latency thresholds for gradual offload (ms)
const LATENCY_MILD = Number(process.env.LATENCY_MILD) || 5000;   // 25% offload starts here
const LATENCY_MODERATE = Number(process.env.LATENCY_MODERATE) || 10000;  // 50%
const LATENCY_SEVERE = Number(process.env.LATENCY_SEVERE) || 15000;  // 75%
const LATENCY_THRESHOLD = Number(process.env.LATENCY_THRESHOLD) || 20000;  // 100% (full offload / failure)

// Sliding-window size and recovery speed
const WINDOW_SIZE = Number(process.env.WINDOW_SIZE) || 30;
const OFFLOAD_DECAY = Number(process.env.OFFLOAD_DECAY) || 0.9;    // multiplier per successful job

// Recovery probe — after a hard failure (ratio=1.0)
// Wait COOLDOWN_MS before sending PROBE_RATIO fraction of traffic as test jobs.
// If probe succeeds with low latency, normal decay takes over from 0.75.
const COOLDOWN_MS = Number(process.env.COOLDOWN_MS) || 15000;  // 15s before probing
const PROBE_RATIO = Number(process.env.PROBE_RATIO) || 0.05;   // 5% probe traffic

const TEE_CHECK_INTERVAL = Number(process.env.TEE_CHECK_INTERVAL) || 5000;

module.exports = {
    ALL_TEEs,
    LATENCY_MILD,
    LATENCY_MODERATE,
    LATENCY_SEVERE,
    LATENCY_THRESHOLD,
    WINDOW_SIZE,
    OFFLOAD_DECAY,
    COOLDOWN_MS,
    PROBE_RATIO,
    TEE_CHECK_INTERVAL,
};