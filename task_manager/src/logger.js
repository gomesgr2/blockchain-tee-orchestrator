const winston = require('winston');

// ------------------------------------------------------
// LOGGER CONFIG
// ------------------------------------------------------
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console()
    ]
});


// ------------------------------------------------------
// HELPER LOG FUNCTION
// ------------------------------------------------------
function log(event, data = {}) {
    logger.info({
        event,
        ...data
    });
}

module.exports = { logger, log };