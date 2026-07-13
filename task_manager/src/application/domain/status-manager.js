// statusManager.js
const { checkTEEHealth } = require('../../infrastructure/tee');
const {
    ALL_TEEs,
    OFFLOAD_PERCENTAGE,
    TEE_CHECK_INTERVAL,
} = require('../../config/status-manager');

let healthyTEEs = [];

// ── Public API ─────────────────────────────────────────────────────────────

let accumulator = 0;

/**
 * Returns true if the current job should be offloaded to the blockchain.
 */
function shouldOffload() {
    if (OFFLOAD_PERCENTAGE <= 0) return false;
    if (OFFLOAD_PERCENTAGE >= 100) return true;

    accumulator += OFFLOAD_PERCENTAGE;
    if (accumulator >= 100) {
        accumulator -= 100;
        return true;
    }

    return false;
}

// Resets the accumulator — used by /admin/reset and unit tests.
function _resetAccumulator() {
    accumulator = 0;
}

/**
 * Returns TEEs that are physically reachable (port open).
 */
function getAvailableTEEs() {
    return healthyTEEs;
}

// ── Background health check ────────────────────────────────────────────────

async function updateHealth() {
    const results = await Promise.all(ALL_TEEs.map(async ip => {
        const alive = await checkTEEHealth(ip);
        return alive ? ip : null;
    }));
    healthyTEEs = results.filter(ip => ip !== null);
}

const ready = updateHealth().then(() => {
    console.log(`[STATUS-MANAGER] Initial health check done. Healthy TEEs: [${healthyTEEs.join(', ') || 'none'}]`);
});
setInterval(updateHealth, TEE_CHECK_INTERVAL);

module.exports = { getAvailableTEEs, shouldOffload, _resetAccumulator, ready };