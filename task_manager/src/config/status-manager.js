const ALL_TEEs = process.env.TEE_IPS ? process.env.TEE_IPS.split(',') : ['tee-1', 'tee-2'];

// Percentage of traffic to statically route to the blockchain (0-100)
const OFFLOAD_PERCENTAGE = Number(process.env.OFFLOAD_PERCENTAGE) || 0;

const TEE_CHECK_INTERVAL = Number(process.env.TEE_CHECK_INTERVAL) || 5000;

module.exports = {
    ALL_TEEs,
    OFFLOAD_PERCENTAGE,
    TEE_CHECK_INTERVAL,
};