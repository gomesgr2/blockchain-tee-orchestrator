const axios = require('axios');

const fs = require('fs').promises;
const path = require('path');

const getFileByUrl = async (url) => {
    // If it's a full URL, attempt HTTP get or just fall back. 
    // Since we're changing this to read locally: we assume "url" is just "1kb.pdf" or "100kb.pdf"

    // Extract filename if it was passed as a URL, or use directly if it's already a filename
    const filename = url.split('/').pop();
    const filePath = path.join(__dirname, './test_files', filename);

    try {
        const fileBuffer = await fs.readFile(filePath);
        return fileBuffer;
    } catch (err) {
        throw new Error(`Failed to read local file: ${filePath}`);
    }
}

module.exports = {
    getFileByUrl
}