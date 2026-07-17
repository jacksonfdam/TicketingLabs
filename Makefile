# Ticketing Labs. One command to rule the containers.
# Run `make help` for the list.

.DEFAULT_GOAL := help
COMPOSE := docker compose

.PHONY: help up down logs ps restart env contract-lint contract-test contract-sync tunnel db-shell load certs clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

env: ## Create .env from .env.example if missing
	@test -f .env || (cp .env.example .env && echo "created .env from .env.example")

up: env ## Bring up the core infrastructure
	$(COMPOSE) up -d --build

down: ## Stop and remove containers
	$(COMPOSE) down

logs: ## Tail logs from all services
	$(COMPOSE) logs -f

ps: ## Show running services
	$(COMPOSE) ps

restart: down up ## Restart everything

contract-lint: ## Lint the OpenAPI contract
	npx --yes @redocly/cli@latest lint contract/openapi.yaml

contract-test: ## Run contract tests against $$TARGET_URL (skips if no backend)
	cd contract/tests && pip install -q -r requirements.txt && pytest -v

contract-sync: ## Refresh the client-lab contract mirror (shared/contract) from the source
	cp contract/openapi.yaml shared/contract/openapi.yaml
	@diff -q contract/openapi.yaml shared/contract/openapi.yaml >/dev/null && echo "shared/contract/openapi.yaml in sync"

tunnel: ## Expose the gateway (port 80) over an external HTTPS URL for device testing (ngrok)
	@echo "Tunnelling the gateway (:80). Point the web and mobile clients at the https URL below."
	@echo "Cloudflare alternative: cloudflared tunnel --url http://localhost:80"
	ngrok http 80

db-shell: ## Open a psql shell on the running Postgres
	$(COMPOSE) exec postgres psql -U $${POSTGRES_USER:-postgres} -d $${POSTGRES_DB:-ticketing}

load: ## Reset stock and run the k6 overselling stampede against the active backend
	$(COMPOSE) exec -T postgres psql -U $${POSTGRES_USER:-postgres} -d $${POSTGRES_DB:-ticketing} \
		-c "UPDATE sectors SET available_inventory = total_inventory; DELETE FROM orders; DELETE FROM reservations; DELETE FROM queue_tokens;"
	docker run --rm --network ticketing-labs_default -v "$(PWD)/infra/load":/s \
		-e TARGET=http://backend:8080 grafana/k6 run /s/reserve-stampede.js

certs: ## Generate local dev TLS certs for the gateway<->backend mTLS example
	bash infra/tls/gen-certs.sh

clean: ## Stop everything and remove volumes (destroys local data)
	$(COMPOSE) down -v
