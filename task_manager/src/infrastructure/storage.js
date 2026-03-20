const axios = require('axios');

const getFileByUrl = async (url) => {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
}

module.exports = {
    getFileByUrl
}