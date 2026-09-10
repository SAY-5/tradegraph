# Changelog

All notable changes to TradeGraph are recorded here. Versions follow semantic
versioning and each one is tagged `vN.0.0`.

## [1.0.0] - 2026-09-10

Baseline release. Python ETL that turns SEC EDGAR data (company tickers, 13F-HR
holdings, Exhibit 21 style subsidiary lists) into RDF under a FIBO-inspired
ontology, a Spring Boot API answering lineage and exposure questions with
SPARQL 1.1 property paths, and an Angular explorer with a d3 neighbourhood
graph, a corporate tree and an exposure breakdown.

- `tradegraph-etl build --sample|--live`, `load`, `stats`; one N-Triples file per named graph.
- `GET /entities`, `/entities/{id}`, `/entities/{id}/lineage`, `/entities/{id}/exposure`, `/trades`, `/graph/neighbors/{id}`, `/stats`, `/actuator/health`.
- Explorer search, force-directed neighbour graph, lineage tree and exposure panel with a path explanation per line.
- Deployment stacks for Apache Jena Fuseki and Stardog, plus `make demo`.
- Tests: 20 ETL pytest, 30 API unit and 12 Testcontainers integration, 7 explorer specs.
