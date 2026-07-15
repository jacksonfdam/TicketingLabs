# Ticketing Labs. One command to rule the containers.
# Run `make help` for the list.

.DEFAULT_GOAL := help
COMPOSE := docker compose

.PHONY: help up down logs ps restart env contract-lint contract-test db-shell clean

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

db-shell: ## Open a psql shell on the running Postgres
	$(COMPOSE) exec postgres psql -U $${POSTGRES_USER:-postgres} -d $${POSTGRES_DB:-ticketing}

clean: ## Stop everything and remove volumes (destroys local data)
	$(COMPOSE) down -v
