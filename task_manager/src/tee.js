const net = require('net');

/**
 * Envia o buffer do PDF para a TEE via Socket TCP.
 * @param {string} host - Hostname ou IP da TEE (ex: 'tee-1')
 * @param {number} port - Porta da TEE (padrão 9090)
 * @param {number|string} jobId - ID da tarefa
 * @param {Buffer} pdfBuffer - Buffer contendo os dados do PDF
 */
function sendJobToTEE(host, port, jobId, pdfBuffer) {
    return new Promise((resolve, reject) => {
        // Validação defensiva para evitar o erro "chunk must be string or Buffer"
        if (!pdfBuffer || !(pdfBuffer instanceof Buffer)) {
            return reject(new Error('O argumento pdfBuffer é obrigatório e deve ser um Buffer.'));
        }

        const client = new net.Socket();

        // Timeout de 50 segundos para processamento
        client.setTimeout(80000);

        client.connect(port, host, () => {
            console.log(`[SOCKET] Conectado a ${host}:${port}. Enviando Job ${jobId}...`);

            // 1. Monta o cabeçalho conforme o parse_header do seu Python
            const header = Buffer.from(`BEGIN#${jobId}##`);
            
            // 2. Define o marcador de final de transmissão
            const footer = Buffer.from('#END_OF_TRANSMISSION#');

            // 3. Envia a sequência completa: Header -> Conteúdo -> Footer
            client.write(header);
            client.write(pdfBuffer);
            client.write(footer);
        });
        
        // Recebe a resposta (o JSON com charCount)
        client.on('data', (data) => {
            resolve('ack');
            client.destroy();
        });

        client.on('error', (err) => {
            client.destroy();
            console.log(err);   
            reject(err);
        });

        client.on('timeout', () => {
            client.destroy();
            reject(new Error('Timeout aguardando resposta da TEE.'));
        });
    });
}


/**
 * Verifica se uma TEE específica está online e aceitando conexões
 * @param {string} host IP da TEE
 * @param {number} port Porta (padrão 9090)
 * @returns {Promise<boolean>}
 */
function checkTEEHealth(host, port = 9090) {
    return new Promise((resolve) => {
        const socket = new net.Socket();

        console.log(`Verificando saúde da TEE em ${host}:${port}...`);
        
        // Define um timeout curto (ex: 300ms) para não travar o Task Manager
        socket.setTimeout(50);

        socket.on('connect', () => {
            socket.destroy(); // Conexão bem-sucedida, podemos fechar
            resolve(true);
        });

        socket.on('error', (err) => {
            console.log(`Erro ao verificar TEE em ${host}:${port} - ${JSON.stringify(err)}`);
            socket.destroy();
            resolve(false);
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });

        socket.connect(port, host);
    });
}

module.exports = { checkTEEHealth, sendJobToTEE };