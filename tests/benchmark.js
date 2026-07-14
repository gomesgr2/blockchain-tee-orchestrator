/**
 * Benchmark — Blockchain-TEE Orchestrator
 *
 * Usage:
 *   node benchmark.js local            # Docker Compose local stack
 *   node benchmark.js cloud            # Azure deployment
 *   node benchmark.js cloud <tm-ip> <file-repo-ip>
 *
 * Environment variables (override any CLI arg):
 *   TM_URL            URL of the Task Manager 1 /submit endpoint
 *   FILE_BASE         Base URL of the file repository (nginx)
 *   RPS_LEVELS        Comma-separated RPS values  (default: 1,10,50,100)
 *   REPEAT            Repetitions per cell         (def3t: 200000)
 *   COOL_DOWN_S       Cool-down between files (s)  (default: 60)
 *   ERROR_THRESHOLD   Max error rate (0–1) before a cell is discarded (default: 0.20)
 */

const axios = require('axios');
const fs = require('fs');
const { performance } = require('perf_hooks');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

// ══════════════════════════════════════════════════════════════════
// CONFIG — resolved from CLI args or environment variables
// ══════════════════════════════════════════════════════════════════

const ENV = detectEnvironment();

const SUBMIT_URL = process.env.TM_URL || ENV.submitUrl;
const FILE_BASE = process.env.FILE_BASE || ENV.fileBase;
const RPS_LEVELS = (process.env.RPS_LEVELS || '60').split(',').map(Number);
const REPEAT = parseInt(process.env.REPEAT || '5', 10);
const TIMEOUT = parseInt(process.env.TIMEOUT_MS || '60000', 10);
const COOL_DOWN = parseInt(process.env.COOL_DOWN_S || '1', 10) * 1000;
const ERROR_THRESHOLD = parseFloat(process.env.ERROR_THRESHOLD || '0.05');

const FILES = ['1kb.pdf', '10kb.pdf', '50kb.pdf', '100kb.pdf', '1mb.pdf'];
const FILE_LABELS = ['1kb', '10kb', '50kb', '100kb', '1mb'];

console.log('═══════════════════════════════════════════════════════');
console.log(` ⚙  Environment      : ${ENV.name.toUpperCase()}`);
console.log(` ⚙  Task Manager     : ${SUBMIT_URL}`);
console.log(` ⚙  File repo        : ${FILE_BASE}`);
console.log(` ⚙  RPS levels       : ${RPS_LEVELS.join(', ')}`);
console.log(` ⚙  Repeat           : ${REPEAT}x per cell`);
console.log(` ⚙  Cool-down        : ${COOL_DOWN / 1000}s`);
console.log(` ⚙  Error threshold  : ${(ERROR_THRESHOLD * 100).toFixed(0)}% (cells above this are discarded)`);
console.log('═══════════════════════════════════════════════════════\n');

// ══════════════════════════════════════════════════════════════════
// ENVIRONMENT DETECTION
// ══════════════════════════════════════════════════════════════════

function detectEnvironment() {
    const mode = process.argv[2] || 'local';
    const tmIp = process.argv[3];
    const fileIp = process.argv[4];

    if (mode === 'cloud') {
        if (!tmIp || !fileIp) {
            console.warn('⚠  Cloud mode without explicit IPs — set TM_URL and FILE_BASE env vars or pass them as arguments.');
            console.warn('   Usage: node benchmark.js cloud <tm-public-ip> <file-repo-ip>\n');
        }
        return {
            name: 'cloud',
            submitUrl: tmIp ? `http://${tmIp}:3000/submit` : 'http://REPLACE_TM_IP:3000/submit',
            fileBase: fileIp ? `https://${fileIp}` : 'http://REPLACE_FILE_IP',
        };
    }

    return {
        name: 'local',
        submitUrl: 'http://localhost:3000/submit',
        fileBase: 'http://file-repo',
    };
}

// ══════════════════════════════════════════════════════════════════
// RESULTS STORE
// ══════════════════════════════════════════════════════════════════

/**
 * results[type][rpsLabel][fileLabel] = {
 *   latencies : number[],   — successful job latencies (s)
 *   errors    : ErrorEntry[], — failed jobs
 *   discarded : boolean,    — true when error rate > ERROR_THRESHOLD
 * }
 */
const results = {
    local: {},
    blockchain_fallback: {},
};

/** Full per-job timeline (successes + failures). */
let detailedTimeline = [];
let globalJobId = 1;

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════

const sleep = ms => new Promise(r => setTimeout(r, ms));

function avg(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Returns the cell object, initialising it if absent.
 * @param {string} type       'local' | 'blockchain_fallback'
 * @param {string} rpsLabel   e.g. '10 RPS'
 * @param {string} fileLabel  e.g. '1kb'
 */
function getCell(type, rpsLabel, fileLabel) {
    results[type][rpsLabel] ??= {};
    if (!results[type][rpsLabel][fileLabel]) {
        results[type][rpsLabel][fileLabel] = { latencies: [], errors: [], discarded: false };
    }
    return results[type][rpsLabel][fileLabel];
}

/**
 * Computes the error rate for a cell.
 * @param {{ latencies: number[], errors: any[] }} cell
 * @returns {number}  0–1
 */
function errorRate(cell) {
    const total = cell.latencies.length + cell.errors.length;
    return total === 0 ? 0 : cell.errors.length / total;
}

// ══════════════════════════════════════════════════════════════════
// CORE
// ══════════════════════════════════════════════════════════════════

async function sendJob(fileUrl, rps, fileLabel) {
    const jobId = globalJobId++;
    const start = performance.now();
    const timestampMs = Date.now();

    try {
        const response = await axios.post(
            SUBMIT_URL,
            { jobId, fileUrl },
            { timeout: TIMEOUT }
        );

        const latency = (performance.now() - start) / 1000;

        const entry = {
            jobId,
            rps,
            fileLabel,
            requestId: response.data.requestId,
            source: response.data.source,
            txHash: response.data.txHash || 'N/A',
            clientLatency: latency,
            timestamp: timestampMs,
            status: 'success',
            errorCode: '',
            errorMessage: '',
        };

        detailedTimeline.push(entry);
        return { ok: true, data: entry };

    } catch (e) {
        const errorCode = e.code || (e.response ? `HTTP_${e.response.status}` : 'UNKNOWN');
        const errorMessage = e.message;

        console.error(`  ✗ Job ${jobId} failed: [${errorCode}] ${errorMessage}`);

        const entry = {
            jobId,
            rps,
            fileLabel,
            requestId: 'N/A',
            source: 'error',
            txHash: 'N/A',
            clientLatency: (performance.now() - start) / 1000,
            timestamp: timestampMs,
            status: 'error',
            errorCode,
            errorMessage,
        };

        detailedTimeline.push(entry);
        return { ok: false, data: entry };
    }
}

/**
 * Runs one RPS burst and returns { successes, errors }.
 */
async function runRpsTest(file, fileLabel, rps) {
    const interval = 1000 / rps;
    const url = file;
    const successes = [];
    const errors = [];
    const promises = [];

    for (let i = 0; i < rps; i++) {
        promises.push(new Promise(resolve => {
            setTimeout(async () => {
                const result = await sendJob(url, rps, fileLabel);
                if (result.ok) {
                    successes.push(result.data);
                } else {
                    errors.push(result.data);
                }
                resolve();
            }, i * interval);
        }));
    }

    await Promise.all(promises);
    return { successes, errors };
}

// ══════════════════════════════════════════════════════════════════
// DISCARD EVALUATION
// ══════════════════════════════════════════════════════════════════

/**
 * After all runs are complete, marks every cell whose overall error rate
 * exceeds ERROR_THRESHOLD as discarded and clears its latency data so it
 * does not pollute charts/averages.
 *
 * @returns {string[]} Human-readable list of discarded cells.
 */
function evaluateAndDiscardCells() {
    const g = [];

    for (const type of ['local', 'blockchain_fallback']) {
        for (const rpsLabel in results[type]) {
            for (const fileLabel in results[type][rpsLabel]) {
                const cell = results[type][rpsLabel][fileLabel];
                const rate = errorRate(cell);

                if (rate > ERROR_THRESHOLD) {
                    cell.discarded = true;
                    const msg = `  ⛔ DISCARDED  ${type} | ${rpsLabel} | ${fileLabel}  — error rate ${(rate * 100).toFixed(1)}% > ${(ERROR_THRESHOLD * 100).toFixed(0)}%`;
                    console.warn(msg);
                    discardedLog.push(`${type},${rpsLabel},${fileLabel},${(rate * 100).toFixed(2)}%`);
                } else if (rate > 0) {
                    console.log(`  ⚠  ${type} | ${rpsLabel} | ${fileLabel}  — error rate ${(rate * 100).toFixed(1)}% (within threshold, kept)`);
                }
            }
        }
    }

    return discardedLog;
}

// ══════════════════════════════════════════════════════════════════
// CHART GENERATION
// ══════════════════════════════════════════════════════════════════

const chart = new ChartJSNodeCanvas({ width: 1200, height: 700, backgroundColour: 'white' });

async function generateAllCharts() {
    // -- CSV: averages + error metrics
    let csvAvg = 'type,rps,file,avg_latency_s,total_jobs,successes,errors,error_rate_pct,discarded\n';
    for (const type of ['local', 'blockchain_fallback']) {
        for (const rpsLabel in results[type]) {
            for (const fileLabel in results[type][rpsLabel]) {
                const cell = results[type][rpsLabel][fileLabel];
                const total = cell.latencies.length + cell.errors.length;
                const errRate = (errorRate(cell) * 100).toFixed(2);
                const avgLat = cell.discarded ? 'N/A' : avg(cell.latencies).toFixed(4);
                csvAvg += `${type},${rpsLabel},${fileLabel},${avgLat},${total},${cell.latencies.length},${cell.errors.length},${errRate},${cell.discarded}\n`;
            }
        }
    }
    fs.writeFileSync('benchmark_averages.csv', csvAvg);
    console.log('  benchmark_averages.csv');

    // -- CSV: detailed timeline
    const timelineCsv = ['jobId,rps,fileLabel,requestId,source,txHash,clientLatency,timestamp,status,errorCode,errorMessage']
        .concat(detailedTimeline.map(e =>
            `${e.jobId},${e.rps},${e.fileLabel},${e.requestId},${e.source},${e.txHash},${e.clientLatency.toFixed(4)},${e.timestamp},${e.status},${e.errorCode},"${e.errorMessage.replace(/"/g, "'")}"`
        )).join('\n');
    fs.writeFileSync('benchmark_timeline.csv', timelineCsv);
    console.log('  benchmark_timeline.csv');

    // -- CSV: error breakdown
    const errorsByCode = {};
    for (const e of detailedTimeline.filter(x => x.status === 'error')) {
        errorsByCode[e.errorCode] = (errorsByCode[e.errorCode] || 0) + 1;
    }
    const errorBreakdownCsv = 'errorCode,count\n'
        + Object.entries(errorsByCode).map(([k, v]) => `${k},${v}`).join('\n') + '\n';
    fs.writeFileSync('benchmark_errors_breakdown.csv', errorBreakdownCsv);
    console.log('  benchmark_errors_breakdown.csv');

    // -- Chart: avg latency per type (local / blockchain_fallback only)
    for (const type of ['local', 'blockchain_fallback']) {
        const datasets = RPS_LEVELS.map((rps, idx) => {
            const rpsLabel = `${rps} RPS`;
            return {
                label: `${rps} RPS`,
                data: FILE_LABELS.map(f => {
                    const cell = results[type][rpsLabel]?.[f];
                    return (!cell || cell.discarded) ? null : avg(cell.latencies);
                }),
                borderColor: `hsl(${idx * 90}, 70%, 50%)`,
                fill: false,
                spanGaps: false,
            };
        });

        const buffer = await chart.renderToBuffer({
            type: 'line',
            data: { labels: FILE_LABELS, datasets },
            options: {
                plugins: {
                    title: {
                        display: true,
                        text: `Avg Latency -- ${type.toUpperCase()} (${ENV.name})`,
                    },
                    tooltip: {
                        callbacks: {
                            label: ctx => ctx.raw === null
                                ? `${ctx.dataset.label}: DISCARDED (error rate > ${(ERROR_THRESHOLD * 100).toFixed(0)}%)`
                                : `${ctx.dataset.label}: ${ctx.raw.toFixed(3)}s`,
                        },
                    },
                },
                scales: { y: { title: { display: true, text: 'Latency (s)' } } },
            },
        });
        const filename = `latency_${type}_${ENV.name}.png`;
        fs.writeFileSync(filename, buffer);
        console.log(`  ${filename}`);
    }
}


// ══════════════════════════════════════════════════════════════════
// MAIN LOOP
// ══════════════════════════════════════════════════════════════════

async function main() {
    console.log('🚀 Starting benchmark...\n');

    for (let fIdx = 0; fIdx < FILES.length; fIdx++) {
        const file = FILES[fIdx];
        const fileLabel = FILE_LABELS[fIdx];

        for (const rps of RPS_LEVELS) {
            const rpsLabel = `${rps} RPS`;

            // Initialise cells for both buckets
            getCell('local', rpsLabel, fileLabel);
            getCell('blockchain_fallback', rpsLabel, fileLabel);

            for (let i = 0; i < REPEAT; i++) {
                console.log(`  [${ENV.name.toUpperCase()}] ${fileLabel} | ${rpsLabel} | run ${i + 1}/${REPEAT}`);
                const { successes, errors } = await runRpsTest(file, fileLabel, rps);

                successes.forEach(res => {
                    const bucket = res.source === 'local' ? 'local' : 'blockchain_fallback';
                    getCell(bucket, rpsLabel, fileLabel).latencies.push(res.clientLatency);
                });

                errors.forEach(res => {
                    // We don't know which bucket an errored job would have gone to,
                    // so we attribute errors to whichever bucket recorded more successes
                    // in this run — or default to 'local' when equal.
                    const lCount = getCell('local', rpsLabel, fileLabel).latencies.length;
                    const bCount = getCell('blockchain_fallback', rpsLabel, fileLabel).latencies.length;
                    const bucket = bCount > lCount ? 'blockchain_fallback' : 'local';
                    getCell(bucket, rpsLabel, fileLabel).errors.push(res);
                });

                const runTotal = successes.length + errors.length;
                const runErrPct = runTotal ? ((errors.length / runTotal) * 100).toFixed(1) : '0.0';
                console.log(`    → ${successes.length} ok / ${errors.length} err (${runErrPct}%)`);
            }

            // Immediately check the combined error rate for this RPS level
            const localCell = getCell('local', rpsLabel, fileLabel);
            const fallbackCell = getCell('blockchain_fallback', rpsLabel, fileLabel);
            const totalErrors = localCell.errors.length + fallbackCell.errors.length;
            const totalJobs = totalErrors + localCell.latencies.length + fallbackCell.latencies.length;

            if (totalJobs > 0) {
                const combinedRate = totalErrors / totalJobs;
                if (combinedRate > ERROR_THRESHOLD) {
                    console.warn(`  ⛔ Error threshold exceeded (${(combinedRate * 100).toFixed(1)}% > ${(ERROR_THRESHOLD * 100).toFixed(0)}%) for ${fileLabel} at ${rpsLabel}.`);
                    console.warn(`  ⏭  Skipping higher RPS levels for ${fileLabel}.`);
                    break; // Skip higher RPS testing since the system has already hit its limit
                }
            }
        }

        if (fIdx < FILES.length - 1) {
            console.log(`\n  ⏱  Cool-down ${COOL_DOWN / 1000}s after ${fileLabel}...`);
            await sleep(COOL_DOWN);
            console.log('  ✅ Resuming.\n');
        }
    }

    console.log('\n📊 Generating results...');
    await generateAllCharts();
    console.log('\n✨ Done.');
}


main();