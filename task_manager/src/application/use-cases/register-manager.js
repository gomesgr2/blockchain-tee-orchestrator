const { GANACHE_ACCOUNT_INDEX } = require('../../config/ganache');

const registerManager = async (web3, contract) => {
    const accounts = await web3.eth.getAccounts();
    const legacyGasPrice = await web3.eth.getGasPrice();

    const taskManagerAddress = accounts[GANACHE_ACCOUNT_INDEX];

    return await contract.methods.registerManager().send({
        from: taskManagerAddress,
        gas: '200000',
        gasPrice: legacyGasPrice.toString()
    });
}

module.exports = {
    registerManager
}