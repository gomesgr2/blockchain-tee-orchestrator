/**
 * Unit tests for the gradual traffic offload logic in status-manager.js.
 *
 * We mock the infrastructure dependencies (checkTEEHealth) so the tests
 * run without network access and without running the background setInterval.
 *
 * Jest is run from task_manager/, so paths are relative to that root.
 */

// ── Mock infrastructure before requiring the module under test ─────────────
jest.mock('../src/infrastructure/tee', () => ({
    checkTEEHealth: jest.fn().mockResolvedValue(true),
}));

// Override env BEFORE the module is imported so constants are picked up.
process.env.TEE_IPS = 'tee-test';
process.env.LATENCY_MILD = '5000';
process.env.LATENCY_MODERATE = '10000';
process.env.LATENCY_SEVERE = '15000';
process.env.LATENCY_THRESHOLD = '20000';
process.env.WINDOW_SIZE = '5';
process.env.OFFLOAD_DECAY = '0.5';   // aggressive decay to make tests deterministic
process.env.TEE_CHECK_INTERVAL = '99999'; // prevent background health-check interference
process.env.NODE_ENV = 'test';       // enables _resetForTesting export
process.env.COOLDOWN_MS = '100';     // very short cooldown for tests
process.env.PROBE_RATIO = '0.05';    // 5% probe

const { getOffloadRatio, updateTeeLatency, _resetForTesting } = require('../src/application/domain/status-manager');

const TEE = 'tee-test';

/** Helper: push N identical latency samples */
function pushLatencies(ms, count = 5) {
    for (let i = 0; i < count; i++) {
        updateTeeLatency(TEE, ms, true);
    }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Gradual Traffic Offload – status-manager', () => {

    beforeEach(() => {
        _resetForTesting();
    });

    test('offloadRatio is 0.0 when all latencies are below LATENCY_MILD', () => {
        pushLatencies(1000); // well below 5000ms
        expect(getOffloadRatio(TEE)).toBe(0);
    });

    test('offloadRatio raises to 0.25 when average enters MILD zone (5000–10000ms)', () => {
        pushLatencies(7000);
        expect(getOffloadRatio(TEE)).toBe(0.25);
    });

    test('offloadRatio raises to 0.50 when average enters MODERATE zone (10000–15000ms)', () => {
        pushLatencies(12000);
        expect(getOffloadRatio(TEE)).toBe(0.50);
    });

    test('offloadRatio raises to 0.75 when average enters SEVERE zone (15000–20000ms)', () => {
        pushLatencies(17000);
        expect(getOffloadRatio(TEE)).toBe(0.75);
    });

    test('offloadRatio raises to 1.0 when average exceeds LATENCY_THRESHOLD (20000ms)', () => {
        pushLatencies(25000);
        expect(getOffloadRatio(TEE)).toBe(1.0);
    });

    test('offloadRatio jumps to 1.0 immediately on a failed job', () => {
        pushLatencies(1000); // start healthy
        updateTeeLatency(TEE, 0, false); // simulate failure
        expect(getOffloadRatio(TEE)).toBe(1.0);
    });

    test('offloadRatio decays towards 0 after fast jobs following a failure', () => {
        // Introduce a failure so ratio = 1.0
        updateTeeLatency(TEE, 0, false);
        expect(getOffloadRatio(TEE)).toBe(1.0);

        // Push enough fast jobs (1ms) to:
        //   1. Fill the window so avg stays below LATENCY_MILD (target=0)
        //   2. Let OFFLOAD_DECAY=0.5 bring the ratio to 0
        // After N successful jobs at low latency: ratio = 1.0 * 0.5^N
        // After 20 iterations: 1.0 * 0.5^20 ≈ 0.000001 → rounds to 0
        pushLatencies(1, 30);
        expect(getOffloadRatio(TEE)).toBe(0);
    });

    test('degradation is immediate (ratio does not lag)', () => {
        // Starts healthy: fill window with fast samples
        pushLatencies(1000);
        expect(getOffloadRatio(TEE)).toBe(0);

        // Fill the entire window (size=5) with severe samples so the
        // rolling average clearly crosses LATENCY_SEVERE → ratio must jump.
        pushLatencies(17000, 5);
        expect(getOffloadRatio(TEE)).toBe(0.75);
    });

});

// ── Probe / Recovery tests ─────────────────────────────────────────────────

describe('Probe mechanism — recovery from full offload', () => {

    beforeEach(() => { _resetForTesting(); });

    test('getOffloadRatio returns 1.0 immediately after a failure (no probe yet)', () => {
        updateTeeLatency(TEE, 0, false);
        // No time has passed → still hard-blocked
        expect(getOffloadRatio(TEE)).toBe(1.0);
    });

    test('getOffloadRatio returns (1 - PROBE_RATIO) after cooldown has elapsed', async () => {
        updateTeeLatency(TEE, 0, false);
        expect(getOffloadRatio(TEE)).toBe(1.0);

        // Wait for COOLDOWN_MS (set to 100ms in test env) to pass
        await new Promise(r => setTimeout(r, 150));

        const ratio = getOffloadRatio(TEE);
        // Should now expose the probe crack: 1.0 - 0.05 = 0.95
        expect(ratio).toBeCloseTo(0.95, 5);
    });

    test('a successful probe job drops offloadRatio from 1.0 to 0.75', async () => {
        updateTeeLatency(TEE, 0, false);
        await new Promise(r => setTimeout(r, 150));

        // Simulate a probe job succeeding (called from process-job when Math.random beat the ratio)
        updateTeeLatency(TEE, 1000, true); // fast probe
        expect(getOffloadRatio(TEE)).toBe(0.75);
    });

});
