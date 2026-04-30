// statusManager.js
const { checkTEEHealth } = require('../../infrastructure/tee');
const {
    ALL_TEEs,
    LATENCY_THRESHOLD,
    LATENCY_MILD,
    LATENCY_MODERATE,
    LATENCY_SEVERE,
    WINDOW_SIZE,
    OFFLOAD_DECAY,
    COOLDOWN_MS,
    PROBE_RATIO,
    TEE_CHECK_INTERVAL,
} = require('../../config/status-manager');

let healthyTEEs = [];

/**
 * Per-TEE state:
 *  - lastLatencies  : sliding window of recent job durations
 *  - offloadRatio   : fraction of jobs to redirect to blockchain (0.0–1.0)
 *  - lastFailureTime: timestamp of last hard failure (null = never failed)
 *                     used to control the post-failure probe cooldown
 */
const teeStats = {};
ALL_TEEs.forEach(ip => {
    teeStats[ip] = {
        lastLatencies: [],
        offloadRatio: 0.0,
        lastFailureTime: null,
    };
});

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Maps an average latency to a target offload ratio.
 *
 * avg < LATENCY_MILD      → 0.00
 * MILD  ≤ avg < MODERATE  → 0.25
 * MODERATE ≤ avg < SEVERE → 0.50
 * SEVERE ≤ avg < THRESHOLD → 0.75
 * avg ≥ THRESHOLD         → 1.00
 */
function _targetRatio(avg) {
    if (avg >= LATENCY_THRESHOLD) return 1.0;
    if (avg >= LATENCY_SEVERE) return 0.75;
    if (avg >= LATENCY_MODERATE) return 0.50;
    if (avg >= LATENCY_MILD) return 0.25;
    return 0.0;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns the effective offload ratio for a TEE.
 *
 * Special case — probe window:
 *   When a TEE is at full offload (ratio = 1.0) due to a hard failure,
 *   we never send it any traffic, so it can never recover on its own.
 *   After COOLDOWN_MS, we "open a crack" by returning (1.0 - PROBE_RATIO)
 *   instead of 1.0. This lets ~PROBE_RATIO (5%) of jobs through as probes.
 *   If those probes succeed quickly, the normal decay mechanism kicks in
 *   and the ratio falls back towards 0.
 */
function getOffloadRatio(ip) {
    const stats = teeStats[ip];
    if (!stats) return 1.0;

    // In probe window: ratio = 1.0 AND cooldown has elapsed
    if (
        stats.offloadRatio === 1.0 &&
        stats.lastFailureTime !== null &&
        Date.now() - stats.lastFailureTime > COOLDOWN_MS
    ) {
        return 1.0 - PROBE_RATIO;   // e.g. 0.95 → 5% passes as probe
    }

    return stats.offloadRatio;
}

/**
 * Returns TEEs that are physically reachable (port open).
 */
function getAvailableTEEs() {
    return healthyTEEs;
}

/**
 * Called after each job attempt.
 * Updates the latency window and recalculates offloadRatio.
 *
 * @param {string}  ip       - TEE host
 * @param {number}  duration - Job round-trip in ms (ignored when success=false)
 * @param {boolean} success  - Whether the job succeeded
 */
function updateTeeLatency(ip, duration, success = true) {
    const stats = teeStats[ip];
    if (!stats) return;

    if (!success) {
        // Hard failure: route everything away from this TEE immediately
        stats.offloadRatio = 1.0;
        stats.lastLatencies = [];
        stats.lastFailureTime = Date.now();
        console.warn(`[TRAFFIC-MANAGER] TEE ${ip} failed. offloadRatio → 1.0 (probe in ${COOLDOWN_MS / 1000}s)`);
        return;
    }

    // ── Successful job ────────────────────────────────────────────────────

    // If we were in probe window (ratio was 1.0 but probe slipped through),
    // a successful probe means the TEE is recovering — drop to 0.75 and
    // let the normal decay take over. Clear lastFailureTime so we don't
    // keep triggering more probes while ratio > 0.
    if (stats.offloadRatio === 1.0) {
        console.log(`[TRAFFIC-MANAGER] TEE ${ip} probe succeeded. offloadRatio 1.0 → 0.75 (decay starting)`);
        stats.offloadRatio = 0.75;
        stats.lastFailureTime = null;
        stats.lastLatencies = [duration]; // seed window with probe latency
        return; // decay starts on the NEXT job, not this one
    }

    // Update sliding window
    stats.lastLatencies.push(duration);
    if (stats.lastLatencies.length > WINDOW_SIZE) stats.lastLatencies.shift();

    const avg = stats.lastLatencies.reduce((a, b) => a + b, 0) / stats.lastLatencies.length;
    const target = _targetRatio(avg);

    if (target > stats.offloadRatio) {
        // Degradation is immediate
        stats.offloadRatio = target;
        stats.lastFailureTime = target === 1.0 ? Date.now() : stats.lastFailureTime;
        if (target > 0) {
            console.warn(
                `[TRAFFIC-MANAGER] TEE ${ip} slowing (avg ${avg.toFixed(0)}ms). ` +
                `offloadRatio → ${(target * 100).toFixed(0)}%`
            );
        }
    } else if (target < stats.offloadRatio) {
        // Recovery is gradual: decay towards target
        const decayed = stats.offloadRatio * OFFLOAD_DECAY;
        // Snap to target if close enough (avoids float values stuck near-zero)
        stats.offloadRatio = decayed <= target || (target === 0 && decayed < 0.001) ? target : decayed;
        if (stats.offloadRatio === 0) {
            console.log(`[TRAFFIC-MANAGER] TEE ${ip} fully recovered. offloadRatio → 0%`);
            stats.lastFailureTime = null;
        }
    }
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

module.exports = { getAvailableTEEs, getOffloadRatio, updateTeeLatency, ready };

// Exposed only for unit testing — resets all per-TEE state to initial values.
if (process.env.NODE_ENV === 'test') {
    module.exports._resetForTesting = () => {
        ALL_TEEs.forEach(ip => {
            teeStats[ip] = { lastLatencies: [], offloadRatio: 0.0, lastFailureTime: null };
        });
    };
}