const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

/**
 * Gera um PDF com tamanho EXATO em bytes usando padding via comentário PDF.
 * Comentários PDF (linhas iniciadas com %) são ignorados pelos leitores mas
 * contam para o tamanho do arquivo — garantia de tamanho real preciso.
 */
async function createPdfBySize(name, targetSizeBytes) {
    // 1. Cria um PDF base mínimo e válido
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const page = pdfDoc.addPage();
    page.drawText(`Benchmark TEE - PGC - ${name}`, {
        x: 50, y: 700, size: 14, font, color: rgb(0, 0, 0),
    });
    page.drawText(`Arquivo de teste gerado para benchmark de latencia TEE.`, {
        x: 50, y: 680, size: 10, font, color: rgb(0.3, 0.3, 0.3),
    });

    const pdfBytes = await pdfDoc.save();
    const baseSize = pdfBytes.length;

    if (baseSize >= targetSizeBytes) {
        // Se o PDF base já for maior que o alvo (improvável para 1kb+ com pdf-lib)
        fs.writeFileSync(path.join('./test_files', `${name}.pdf`), pdfBytes);
        console.log(`⚠  ${name}.pdf | Base já excede alvo: ${(baseSize / 1024).toFixed(2)} KB`);
        return;
    }

    // 2. Calcula o padding necessário
    // Formato do bloco de padding: "\n% " + <N bytes de dados> + "\n"
    const paddingHeader = Buffer.from('\n% ');
    const paddingFooter = Buffer.from('\n');
    const paddingDataSize = targetSizeBytes - baseSize - paddingHeader.length - paddingFooter.length;

    // Preenche com caracteres ASCII visíveis para não corromper parsers
    const paddingData = Buffer.alloc(paddingDataSize, 0x58); // 'X'

    const finalBuffer = Buffer.concat([
        Buffer.from(pdfBytes),
        paddingHeader,
        paddingData,
        paddingFooter,
    ]);

    fs.writeFileSync(path.join('./test_files', `${name}.pdf`), finalBuffer);

    const actualKB = (finalBuffer.length / 1024).toFixed(2);
    const targetKB = (targetSizeBytes / 1024).toFixed(2);
    const diff = finalBuffer.length - targetSizeBytes;
    console.log(`✓  ${name}.pdf | Alvo: ${targetKB} KB | Real: ${actualKB} KB | Diff: ${diff} bytes`);
}

async function generateAll() {
    const outDir = './test_files';
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    console.log('Gerando PDFs com tamanho exato...\n');

    await createPdfBySize('1kb', 1 * 1024);
    await createPdfBySize('5kb', 5 * 1024);
    await createPdfBySize('10kb', 10 * 1024);
    await createPdfBySize('50kb', 50 * 1024);
    await createPdfBySize('100kb', 100 * 1024);
    await createPdfBySize('500kb', 500 * 1024);
    await createPdfBySize('1mb', 1024 * 1024);
    await createPdfBySize('5mb', 5 * 1024 * 1024);

    console.log('\nTodos os arquivos gerados em ./test_files/');
}

generateAll().catch(console.error);