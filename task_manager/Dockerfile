FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Usando o comando que resolveu seu problema de CommonJS
CMD ["npx", "ts-node-dev", "--transpile-only", "src/index.js"]