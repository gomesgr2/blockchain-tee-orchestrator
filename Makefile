.PHONY: infra up down logs clean tf-init stop-apps start benchmark-local benchmark-cloud

COMPOSE_INFRA = docker compose -f docker-compose.infra.yml
COMPOSE_APPS  = docker compose -f docker-compose.apps.yml

# ── Terraform ─────────────────────────────────────────────────────────
tf-init:
	@echo "Starting interactive Terraform init shell..."
	@bash ./infra/iac/tf-init.sh

# ── Benchmark ─────────────────────────────────────────────────────────

## Run benchmark against the local Docker stack
benchmark-local:
	@cd tests && node benchmark.js local

## Run benchmark against the Azure deployment
## Usage: make benchmark-cloud TM_IP=<ip> FILE_IP=<ip>
benchmark-cloud:
	@cd tests && node benchmark.js cloud $(TM_IP) $(FILE_IP)


## 1. Start infrastructure (Ganache + contract deployer + file-repo)
##    Waits until the deployer container exits, then extracts CONTRACT_ADDRESS.
infra:
	$(COMPOSE_INFRA) up -d --build
	@echo "⏳ Waiting for contract-deployer container to start..."
	@until docker inspect contract-deployer >/dev/null 2>&1; do sleep 1; done
	@echo "⏳ Waiting for contract-deployer to finish..."
	@until [ "$$(docker inspect -f '{{.State.Status}}' contract-deployer 2>/dev/null)" = "exited" ]; do sleep 2; done
	@EXIT_CODE=$$(docker inspect -f '{{.State.ExitCode}}' contract-deployer); \
	if [ "$$EXIT_CODE" != "0" ]; then \
		echo "❌ Deploy failed (exit $$EXIT_CODE). Logs:"; \
		docker logs contract-deployer; \
		exit 1; \
	fi
	@docker logs contract-deployer 2>&1 | grep 'CONTRACT_ADDRESS' | tail -1 | cut -d= -f2 > .contract_addr.tmp
	@echo "CONTRACT_ADDRESS=$$(cat .contract_addr.tmp)" > .env.local
	@echo "✅ CONTRACT_ADDRESS=$$(cat .contract_addr.tmp)"
	@rm -f .contract_addr.tmp

## 2. Start application clusters (requires 'make infra' to have run first)
up:
	@if [ ! -f .env.local ]; then \
		echo "❌ .env.local not found. Run 'make infra' first."; exit 1; \
	fi
	@export $$(cat .env.local | xargs) && \
		$(COMPOSE_APPS) up -d --build
	@echo "🚀 Clusters running:"
	@echo "   Cluster A  →  TM-1 : http://localhost:3000"
	@echo "   Cluster B  →  TM-2 : http://localhost:3001"
	@echo "   File repo  →        http://localhost:8080"
	@echo "   Ganache    →        http://localhost:8545"

## Start everything in one shot
start: infra up

## Stream logs for all services
logs:
	@$(COMPOSE_INFRA) logs -f --no-log-prefix --tail=50 &
	@$(COMPOSE_APPS) logs -f --no-log-prefix --tail=50

## Logs for infra only
logs-infra:
	$(COMPOSE_INFRA) logs -f

## Logs for apps only
logs-apps:
	$(COMPOSE_APPS) logs -f

## Stop applications only (leaves Ganache + file-repo running)
stop-apps:
	$(COMPOSE_APPS) down

## Stop everything
down:
	$(COMPOSE_APPS) down --remove-orphans 2>/dev/null || true
	$(COMPOSE_INFRA) down --remove-orphans 2>/dev/null || true

## Stop + remove volumes (full reset)
clean:
	$(COMPOSE_APPS) down -v --remove-orphans 2>/dev/null || true
	$(COMPOSE_INFRA) down -v --remove-orphans 2>/dev/null || true
	rm -f .env.local .contract_addr.tmp
	@echo "🧹 Clean done."
