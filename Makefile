SHELL := /bin/bash
.DEFAULT_GOAL := help

UV        ?= uv
MVN       ?= mvn
NPM       ?= npm
COMPOSE   ?= docker compose
FUSEKI_URL ?= http://localhost:3030/ds
API_URL    ?= http://localhost:8080
ETL_BUILD  := etl/build
# Ryuk cannot bind mount the Docker socket on Colima; containers are stopped by a JVM shutdown hook instead.
export TESTCONTAINERS_RYUK_DISABLED ?= true

.PHONY: help setup lint test demo etl-sample etl-validate etl-load api explorer explorer-dist fuseki-up fuseki-down clean

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-14s %s\n", $$1, $$2}'

setup: ## Install ETL, API and explorer dependencies
	cd etl && $(UV) sync
	cd api && $(MVN) -B -q dependency:go-offline
	cd explorer && $(NPM) ci

lint: ## Lint every component
	cd etl && $(UV) run ruff check . && $(UV) run ruff format --check .
	cd api && $(MVN) -B -q checkstyle:check
	cd explorer && $(NPM) run lint

test: etl-sample ## Run every test suite (ETL pytest, API mvn verify with Testcontainers, explorer tests + build)
	cd etl && $(UV) run pytest
	cd api && $(MVN) -B verify
	cd explorer && $(NPM) run lint && $(NPM) test -- --watch=false && $(NPM) run build

etl-sample: ## Transform the committed sample to N-Triples under etl/build
	cd etl && $(UV) run tradegraph-etl build --sample --out build

etl-validate: ## Check the sample against the SHACL shapes and write etl/build/quality.json
	cd etl && $(UV) run tradegraph-etl validate --sample --out build

etl-load: ## Load etl/build into the Fuseki dataset
	cd etl && $(UV) run tradegraph-etl load --endpoint $(FUSEKI_URL) --store fuseki --build-dir build

fuseki-up: ## Start Fuseki from deploy/docker-compose.yml
	$(COMPOSE) -f deploy/docker-compose.yml up -d fuseki
	@scripts/wait-for.sh '$(FUSEKI_URL)/sparql?query=ASK%7B%7D' 60

fuseki-down: ## Stop the Fuseki container started by fuseki-up
	$(COMPOSE) -f deploy/docker-compose.yml stop fuseki

api: ## Run the API against Fuseki (profile fuseki)
	cd api && $(MVN) -B -q spring-boot:run -Dspring-boot.run.profiles=fuseki

explorer: ## Run the Angular dev server
	cd explorer && $(NPM) start

explorer-dist: ## Production build of the explorer into explorer/dist
	cd explorer && $(NPM) run build

demo: ## Start Fuseki, load the sample, start the API, run scripted queries and print a summary
	@scripts/demo.sh

clean: ## Remove build outputs
	rm -rf $(ETL_BUILD) api/target explorer/dist explorer/.angular
