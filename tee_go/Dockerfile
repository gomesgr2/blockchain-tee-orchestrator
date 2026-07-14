# ── 1. Etapa de Build (Alpine) ──────────────────────────
FROM golang:1.24-alpine AS builder

WORKDIR /app
COPY main.go .

# Inicializa o módulo e instale o pacote de PDF do Go
RUN go mod init tee_go && \
    go get github.com/ledongthuc/pdf && \
    go mod tidy

# Compila de forma estática, sem CGO, gerando um binário puro (ideal para TEEs)
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o server_go main.go

# ── 2. Etapa de Execução (Scratch Security) ─────────────
FROM alpine:latest

WORKDIR /app
# Somente copia o binário golang gerado da builder
COPY --from=builder /app/server_go .

EXPOSE 9090

# Não há interpretador python, nem nada, apenas o binario para extrair PDF local na CPU
ENTRYPOINT ["./server_go"]
