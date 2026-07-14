#!/usr/bin/env node
/**
 * merge_timelines.js
 *
 * Joins benchmark_timeline.csv (Cluster A — submitter) with
 * blockchain_latencies.csv (Cluster B — processor) on jobId.
 *
 * Usage:
 *   node merge_timelines.js
 *   node merge_timelines.js [timeline.csv] [latencies.csv] [output.csv]
 *
 * Output columns:
 *   jobId, rps, fileLabel, txHash,
 *   clientLatencyS        — time until blockchain ACK (cluster A side)
 *   capturedAt            — ms when cluster B detected the event
 *   processingMs          — TEE processing time on cluster B
 *   totalWorkflowMs       — event capture → job complete on cluster B
 *   endToEndMs            — estimated full journey (clientLatencyS*1000 + totalWorkflowMs)
 *   success               — whether cluster B processed it successfully
 *   blockNumber
 */

const fs = require('fs');

// ── Args / defaults ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const TIMELINE_PATH = args.length > 0 ? args[0] : 'benchmark_timeline.csv';
// O último argumento sempre será o output (se houver mais de 2 args)
const OUTPUT_PATH = args.length > 1 ? args[args.length - 1] : 'blockchain_merged.csv';
// Todos os argumentos do meio serão tratados como os arquivos de latência dos clusters
const LATENCIES_PATHS = args.length > 2 ? args.slice(1, -1) : ['blockchain_latencies.csv'];

// ── Helpers ────────────────────────────────────────────────────────────────

function parseCsv(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(`⚠️  Warning: File not found: ${filePath}`);
        return [];
    }
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
    const headers = lines[0].split(',');
    return lines.slice(1).map(line => {
        // Handles quoted fields (e.g., errorMessage)
        const values = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g) || [];
        const obj = {};
        headers.forEach((h, i) => {
            obj[h.trim()] = (values[i] || '').replace(/^"|"$/g, '').trim();
        });
        return obj;
    });
}

// ── Main ───────────────────────────────────────────────────────────────────

const timeline = parseCsv(TIMELINE_PATH);

const latencies = [];
for (const p of LATENCIES_PATHS) {
    latencies.push(...parseCsv(p));
}

// Index latencies by jobId for O(1) lookup
const latencyByJobId = {};
for (const row of latencies) {
    latencyByJobId[row.jobId] = row;
}

// Map ALL jobs (local and fallback) into the joined array
const joined = [];
let matched = 0, unmatched = 0, local = 0;

for (const t of timeline) {
    // 1. Mapeamento de Jobs Locais
    if (t.source === 'local') {
        local++;
        const clientMs = parseFloat(t.clientLatency) * 1000;
        joined.push({
            jobId: t.jobId,
            rps: t.rps,
            fileLabel: t.fileLabel,
            source: 'local',
            txHash: 'N/A',
            clientLatencyS: t.clientLatency,
            capturedAt: '',
            processingMs: '',
            totalWorkflowMs: '',
            endToEndMs: clientMs.toFixed(0),
            success: 'true', // Assumimos que o local funcionou pois retornou no benchmark diretamente
            blockNumber: '',
        });
        continue;
    }

    // 2. Mapeamento de Jobs Blockchain
    if (t.source !== 'blockchain_fallback') continue;

    const l = latencyByJobId[t.jobId];

    if (!l) {
        // No match yet — cluster B may still be processing or CSV is missing
        unmatched++;
        joined.push({
            jobId: t.jobId,
            rps: t.rps,
            fileLabel: t.fileLabel,
            source: 'blockchain',
            txHash: t.txHash || 'N/A',
            clientLatencyS: t.clientLatency,
            capturedAt: '',
            processingMs: '',
            totalWorkflowMs: '',
            endToEndMs: '',
            success: 'PENDING',
            blockNumber: '',
        });
        continue;
    }

    matched++;
    const clientMs = parseFloat(t.clientLatency) * 1000; // s → ms
    const workflowMs = parseFloat(l.totalWorkflowMs);
    const endToEndMs = isNaN(workflowMs) ? '' : (clientMs + workflowMs).toFixed(0);

    joined.push({
        jobId: t.jobId,
        rps: t.rps,
        fileLabel: t.fileLabel,
        source: 'blockchain',
        txHash: t.txHash || l.txHash || 'N/A',
        clientLatencyS: t.clientLatency,
        capturedAt: l.capturedAt || '',
        processingMs: l.processingMs || '',
        totalWorkflowMs: l.totalWorkflowMs || '',
        endToEndMs,
        success: l.success || 'PENDING',
        blockNumber: l.blockNumber || '',
    });
}

// ── Write output ───────────────────────────────────────────────────────────

const header = 'jobId,rps,fileLabel,source,txHash,clientLatencyS,capturedAt,processingMs,totalWorkflowMs,endToEndMs,success,blockNumber\n';
const rows = joined.map(r =>
    [r.jobId, r.rps, r.fileLabel, r.source, r.txHash, r.clientLatencyS,
    r.capturedAt, r.processingMs, r.totalWorkflowMs,
    r.endToEndMs, r.success, r.blockNumber].join(',')
).join('\n');

fs.writeFileSync(OUTPUT_PATH, header + rows + '\n');

// ── Summary ────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════');
console.log(' merge_timelines.js — result');
console.log('══════════════════════════════════════════════════');
console.log(` Timeline       : ${TIMELINE_PATH}  (${timeline.length} rows)`);
console.log(` Latencies files: ${LATENCIES_PATHS.join(', ')}  (${latencies.length} rows)`);
console.log(` Local jobs     : ${local}`);
console.log(` BC jobs        : ${matched + unmatched}  (matched: ${matched}, pending/unmatched: ${unmatched})`);
console.log(` Output         : ${OUTPUT_PATH}`);

if (matched > 0) {
    const validMs = joined
        .filter(r => r.endToEndMs && r.success === 'true')
        .map(r => parseFloat(r.endToEndMs));
    const avg = ms => (ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(0);
    const byRps = {};
    joined.filter(r => r.endToEndMs && r.success === 'true').forEach(r => {
        byRps[r.rps] ??= [];
        byRps[r.rps].push(parseFloat(r.endToEndMs));
    });

    console.log('\n Avg end-to-end latency by RPS (ms):');
    for (const [rps, values] of Object.entries(byRps).sort((a, b) => Number(a[0]) - Number(b[0]))) {
        console.log(`   ${rps.padStart(5)} RPS → ${avg(values)} ms  (n=${values.length})`);
    }

    if (validMs.length > 0) {
        console.log(`\n Overall avg end-to-end : ${avg(validMs)} ms`);
    }
}

console.log('══════════════════════════════════════════════════\n');
