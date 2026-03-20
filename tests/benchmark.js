/**
 * Benchmark — Blockchain-TEE Orchestrator
 *
 * Usage:
 *   node benchmark.js local            # Docker Compose local stack
 *   node benchmark.js cloud            # Azure deployment
 *   node benchmark.js cloud <tm-ip> <file-repo-ip>
 *
 * Environment variables (override any CLI arg):
 *   TM_URL       URL of the Task Manager 1 /submit endpoint
 *   FILE_BASE    Base URL of the file repository (nginx)
 *   RPS_LEVELS   Comma-separated RPS values  (default: 1,10,50,100)
 *   REPEAT       Repetitions per cell         (default: 5)
 *   TIMEOUT_MS   Per-request timeout ms       (default: 60000)
 *   COOL_DOWN_S  Cool-down between files (s)  (default: 60)
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
const RPS_LEVELS = (process.env.RPS_LEVELS || '1,10,50,100').split(',').map(Number);
const REPEAT = parseInt(process.env.REPEAT || '5', 10);
const TIMEOUT = parseInt(process.env.TIMEOUT_MS || '60000', 10);
const COOL_DOWN = parseInt(process.env.COOL_DOWN_S || '60', 10) * 1000;

const FILES = ['1kb.pdf', '5kb.pdf', '10kb.pdf', '50kb.pdf', '100kb.pdf'];
const FILE_LABELS = ['1kb', '5kb', '10kb', '50kb', '100kb'];

console.log('═══════════════════════════════════════════════════════');
console.log(` ⚙  Environment  : ${ENV.name.toUpperCase()}`);
console.log(` ⚙  Task Manager : ${SUBMIT_URL}`);
console.log(` ⚙  File repo    : ${FILE_BASE}`);
console.log(` ⚙  RPS levels   : ${RPS_LEVELS.join(', ')}`);
console.log(` ⚙  Repeat       : ${REPEAT}x per cell`);
console.log(` ⚙  Cool-down    : ${COOL_DOWN / 1000}s`);
console.log('═══════════════════════════════════════════════════════\n');

// ══════════════════════════════════════════════════════════════════
// ENVIRONMENT DETECTION
// ══════════════════════════════════════════════════════════════════

function detectEnvironment() {
    const mode = process.argv[2] || 'local';
    const tmIp = process.argv[3];   // optional cloud overrides
    const fileIp = process.argv[4];

    if (mode === 'cloud') {
        if (!tmIp || !fileIp) {
            console.warn('⚠  Cloud mode without explicit IPs — set TM_URL and FILE_BASE env vars or pass them as arguments.');
            console.warn('   Usage: node new_benchmark.js cloud <tm-public-ip> <file-repo-ip>\n');
        }
        return {
            name: 'cloud',
            submitUrl: tmIp ? `http://${tmIp}:3000/submit` : 'http://REPLACE_TM_IP:3000/submit',
            fileBase: fileIp ? `http://${fileIp}` : 'http://REPLACE_FILE_IP',
        };
    }

    // Default: local Docker Compose
    return {
        name: 'local',
        submitUrl: 'http://localhost:3000/submit',
        fileBase: 'http://file-repo',
    };
}

// ══════════════════════════════════════════════════════════════════
// RESULTS STORE
// ══════════════════════════════════════════════════════════════════

const results = {
    local: {},
    blockchain_fallback: {},
};

let detailedTimeline = [];
let globalJobId = 1;

// ══════════════════════════════════════════════════════════════════
// CORE
// ══════════════════════════════════════════════════════════════════

const sleep = ms => new Promise(r => setTimeout(r, ms));

function avg(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

async function sendJob(fileUrl) {
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
            requestId: response.data.requestId,
            source: response.data.source,
            txHash: response.data.txHash || 'N/A',
            clientLatency: latency,
            timestamp: timestampMs,
        };

        detailedTimeline.push(entry);
        return entry;
    } catch (e) {
        console.error(`  ✗ Job ${jobId} failed: ${e.code || e.message}`);
        return null;
    }
}

async function runRpsTest(file, rps) {
    const interval = 1000 / rps;
    const url = `${FILE_BASE}/${file}`;
    const batchResults = [];
    const promises = [];

    for (let i = 0; i < rps; i++) {
        promises.push(new Promise(resolve => {
            setTimeout(async () => {
                const result = await sendJob(url);
                if (result) batchResults.push(result);
                resolve();
            }, i * interval);
        }));
    }

    await Promise.all(promises);
    return batchResults;
}

// ══════════════════════════════════════════════════════════════════
// CHART GENERATION
// ══════════════════════════════════════════════════════════════════

const chart = new ChartJSNodeCanvas({ width: 1200, height: 700, backgroundColour: 'white' });

async function generateAllCharts() {
    // CSV — averages
    let csvAvg = 'type,rps,file,avg_latency_s\n';
    for (const type of ['local', 'blockchain_fallback']) {
        for (const rps in results[type]) {
            for (const file in results[type][rps]) {
                csvAvg += `${type},${rps},${file},${avg(results[type][rps][file]).toFixed(4)}\n`;
            }
        }
    }
    fs.writeFileSync('benchmark_averages.csv', csvAvg);
    console.log('  📄 benchmark_averages.csv');

    // CSV — detailed timeline
    const timelineCsv = ['jobId,requestId,source,txHash,clientLatency,timestamp']
        .concat(detailedTimeline.map(e =>
            `${e.jobId},${e.requestId},${e.source},${e.txHash},${e.clientLatency.toFixed(4)},${e.timestamp}`
        )).join('\n');
    fs.writeFileSync('benchmark_timeline.csv', timelineCsv);
    console.log('  📄 benchmark_timeline.csv');

    // Charts — latency per type
    for (const type of ['local', 'blockchain_fallback']) {
        const datasets = RPS_LEVELS.map((rps, idx) => ({
            label: `${rps} RPS`,
            data: FILE_LABELS.map(f => avg(results[type][`${rps} RPS`]?.[f])),
            borderColor: `hsl(${idx * 90}, 70%, 50%)`,
            fill: false,
        }));
        const buffer = await chart.renderToBuffer({
            type: 'line',
            data: { labels: FILE_LABELS, datasets },
            options: {
                plugins: { title: { display: true, text: `Avg Latency — ${type.toUpperCase()} (${ENV.name})` } },
                scales: { y: { title: { display: true, text: 'Latency (s)' } } },
            },
        });
        const filename = `latency_${type}_${ENV.name}.png`;
        fs.writeFileSync(filename, buffer);
        console.log(`  📊 ${filename}`);
    }

    // Chart — local vs fallback distribution (at max RPS)
    await generateDistributionGraph(`${Math.max(...RPS_LEVELS)} RPS`);

    // Chart — throughput
    await generateThroughputGraph();
}

async function generateDistributionGraph(rpsLabel) {
    const localPct = FILE_LABELS.map(file => {
        const l = results.local[rpsLabel]?.[file]?.length || 0;
        const b = results.blockchain_fallback[rpsLabel]?.[file]?.length || 0;
        return (l / (l + b || 1)) * 100;
    });
    const bcPct = localPct.map(p => 100 - p);

    const buffer = await chart.renderToBuffer({
        type: 'bar',
        data: {
            labels: FILE_LABELS,
            datasets: [
                { label: 'Local', data: localPct, backgroundColor: '#4bc0c0' },
                { label: 'Blockchain', data: bcPct, backgroundColor: '#ff6384' },
            ],
        },
        options: {
            plugins: { title: { display: true, text: `Distribution @ ${rpsLabel} — ${ENV.name}` } },
            scales: { x: { stacked: true }, y: { stacked: true, max: 100 } },
        },
    });
    const filename = `distribution_${rpsLabel.replace(' ', '')}RPS_${ENV.name}.png`;
    fs.writeFileSync(filename, buffer);
    console.log(`  📊 ${filename}`);
}

async function generateThroughputGraph() {
    const localT = RPS_LEVELS.map(rps => {
        let n = 0;
        FILE_LABELS.forEach(f => { n += results.local[`${rps} RPS`]?.[f]?.length || 0; });
        return n / (REPEAT * FILES.length);
    });
    const bcT = RPS_LEVELS.map(rps => {
        let n = 0;
        FILE_LABELS.forEach(f => { n += results.blockchain_fallback[`${rps} RPS`]?.[f]?.length || 0; });
        return n / (REPEAT * FILES.length);
    });

    const buffer = await chart.renderToBuffer({
        type: 'bar',
        data: {
            labels: RPS_LEVELS.map(r => `${r} RPS`),
            datasets: [
                { label: 'Local Throughput', data: localT, backgroundColor: '#4bc0c0' },
                { label: 'Blockchain Throughput', data: bcT, backgroundColor: '#ff6384' },
            ],
        },
        options: {
            plugins: { title: { display: true, text: `Throughput — ${ENV.name}` } },
            scales: { y: { title: { display: true, text: 'Avg successful jobs / run' } } },
        },
    });
    const filename = `throughput_${ENV.name}.png`;
    fs.writeFileSync(filename, buffer);
    console.log(`  📊 ${filename}`);
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

            results.local[rpsLabel] ??= {};
            results.blockchain_fallback[rpsLabel] ??= {};
            results.local[rpsLabel][fileLabel] = [];
            results.blockchain_fallback[rpsLabel][fileLabel] = [];

            for (let i = 0; i < REPEAT; i++) {
                console.log(`  [${ENV.name.toUpperCase()}] ${fileLabel} | ${rpsLabel} | run ${i + 1}/${REPEAT}`);
                const batch = await runRpsTest(file, rps);

                batch.forEach(res => {
                    const bucket = res.source === 'local' ? 'local' : 'blockchain_fallback';
                    results[bucket][rpsLabel][fileLabel].push(res.clientLatency);
                });
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