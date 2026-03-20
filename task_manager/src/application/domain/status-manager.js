// statusManager.js
const { checkTEEHealth } = require('../../infrastructure/tee');
const { ALL_TEEs, LATENCY_THRESHOLD, WINDOW_SIZE, COOLDOWN_MS, TEE_CHECK_INTERVAL } = require('../../config/status-manager');


let healthyTEEs = [];
const teeStats = {};
ALL_TEEs.forEach(ip => {
    teeStats[ip] = {
        state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
        lastLatencies: [],
        lastFailureTime: null,
        testInFlight: false // Garante que apenas 1 job entre no modo HALF_OPEN
    };
});

/**
 * Atualiza a disponibilidade física (Porta Aberta) em background
 */
async function updateHealth() {
    const results = await Promise.all(ALL_TEEs.map(async ip => {
        const alive = await checkTEEHealth(ip);
        return alive ? ip : null;
    }));
    healthyTEEs = results.filter(ip => ip !== null);
}

/**
 * Lógica de Máquina de Estados para selecionar TEEs disponíveis
 */
function getAvailableTEEs() {
    const now = Date.now();

    return healthyTEEs.filter(ip => {
        const stats = teeStats[ip];

        // 1. Se está fechado, está disponível
        if (stats.state === 'CLOSED') return true;

        // 2. Se está aberto, verifica se o tempo de cooldown passou
        if (stats.state === 'OPEN') {
            if (now - stats.lastFailureTime > COOLDOWN_MS) {
                stats.state = 'HALF_OPEN';
                stats.testInFlight = false; // Reseta para permitir o teste
                console.log(`[CIRCUIT BREAKER] TEE ${ip} entrou em HALF_OPEN. Tentando um job de teste...`);
            } else {
                return false; // Continua em OPEN
            }
        }

        // 3. Se está em HALF_OPEN, só permite se não houver um teste em andamento
        if (stats.state === 'HALF_OPEN') {
            if (!stats.testInFlight) {
                return true; // Deixa passar apenas este job
            }
            return false;
        }

        return false;
    });
}

/**
 * Atualiza latência e gerencia transição de estados após o Job
 */
function updateTeeLatency(ip, duration, success = true) {
    const stats = teeStats[ip];
    if (!stats) return;

    // Se o job enviado era um teste (Half-Open)
    const wasTest = stats.state === 'HALF_OPEN';
    if (wasTest) stats.testInFlight = true;

    if (!success) {
        stats.state = 'OPEN';
        stats.lastFailureTime = Date.now();
        stats.lastLatencies = []; // Limpa histórico
        console.warn(`[CIRCUIT BREAKER] TEE ${ip} falhou. Circuito ABERTO.`);
        return;
    }

    // Gerenciamento de Latência
    stats.lastLatencies.push(duration);
    if (stats.lastLatencies.length > WINDOW_SIZE) stats.lastLatencies.shift();
    const avg = stats.lastLatencies.reduce((a, b) => a + b, 0) / stats.lastLatencies.length;

    // Transições de estado baseadas em performance
    if (wasTest && avg < LATENCY_THRESHOLD) {
        console.log(`[CIRCUIT BREAKER] TEE ${ip} recuperada. Circuito FECHADO.`);
        stats.state = 'CLOSED';
        stats.testInFlight = false;
    } else if (avg > LATENCY_THRESHOLD) {
        console.warn(`[CIRCUIT BREAKER] TEE ${ip} saturada (Média: ${avg.toFixed(0)}ms). Abrindo circuito.`);
        stats.state = 'OPEN';
        stats.lastFailureTime = Date.now();
    }
}

// Background Task
setInterval(updateHealth, TEE_CHECK_INTERVAL);
updateHealth();

module.exports = { getAvailableTEEs, updateTeeLatency };