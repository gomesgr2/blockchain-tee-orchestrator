/**
 * Unit tests for the fixed percentage offload logic in status-manager.js.
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

// Setup default env before require
process.env.TEE_IPS = 'tee-test';
process.env.TEE_CHECK_INTERVAL = '99999'; // prevent background health-check interference
process.env.NODE_ENV = 'test';

let statusManager;

describe('Deterministic Traffic Offload – status-manager', () => {
    beforeEach(() => {
        jest.resetModules();
    });

    test('shouldOffload is false when OFFLOAD_PERCENTAGE is not set or 0', () => {
        delete process.env.OFFLOAD_PERCENTAGE;
        statusManager = require('../src/application/domain/status-manager');
        expect(statusManager.shouldOffload()).toBe(false);
        expect(statusManager.shouldOffload()).toBe(false);
    });

    test('shouldOffload distributes 1% exactly (1 out of 100)', () => {
        process.env.OFFLOAD_PERCENTAGE = '1';
        statusManager = require('../src/application/domain/status-manager');
        statusManager._resetAccumulator();

        let offloads = 0;
        for (let i = 0; i < 100; i++) {
            if (statusManager.shouldOffload()) offloads++;
        }
        expect(offloads).toBe(1);
    });

    test('shouldOffload distributes 5% exactly (5 out of 100)', () => {
        process.env.OFFLOAD_PERCENTAGE = '5';
        statusManager = require('../src/application/domain/status-manager');
        statusManager._resetAccumulator();

        let offloads = 0;
        for (let i = 0; i < 100; i++) {
            if (statusManager.shouldOffload()) offloads++;
        }
        expect(offloads).toBe(5);
    });

    test('shouldOffload distributes 10% exactly (10 out of 100)', () => {
        process.env.OFFLOAD_PERCENTAGE = '10';
        statusManager = require('../src/application/domain/status-manager');
        statusManager._resetAccumulator();

        let offloads = 0;
        for (let i = 0; i < 100; i++) {
            if (statusManager.shouldOffload()) offloads++;
        }
        expect(offloads).toBe(10);
    });

    test('shouldOffload is always true when OFFLOAD_PERCENTAGE is 100', () => {
        process.env.OFFLOAD_PERCENTAGE = '100';
        statusManager = require('../src/application/domain/status-manager');
        statusManager._resetAccumulator();

        let offloads = 0;
        for (let i = 0; i < 10; i++) {
            if (statusManager.shouldOffload()) offloads++;
        }
        expect(offloads).toBe(10);
    });

    test('accumulator wraps around continuously across multiple batches', () => {
        process.env.OFFLOAD_PERCENTAGE = '33'; // 33%
        statusManager = require('../src/application/domain/status-manager');
        statusManager._resetAccumulator();

        let offloads = 0;
        // Running 300 times should yield exactly 99 offloads (33 * 3)
        for (let i = 0; i < 300; i++) {
            if (statusManager.shouldOffload()) offloads++;
        }
        expect(offloads).toBe(99);
    });
});
