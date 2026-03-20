FROM node:18-alpine
WORKDIR /app

# Web3 only — lightweight deployer image
COPY deploy.js .
COPY smartContract.json .
RUN npm init -y && npm install web3

ENTRYPOINT ["node", "deploy.js", "./smartContract.json"]
