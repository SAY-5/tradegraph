# Changelog

All notable changes to TradeGraph are recorded here. Versions follow semantic
versioning and each one is tagged `vN.0.0`.

## [2.0.0] - 2026-09-10

Temporal filings. Positions carry the reporting period of the filing they came
from, so a query now answers over one period instead of summing a holding once
per quarter.

- ETL normalises reported periods (`YYYY-MM-DD`, `YYYYMMDD`, `MM/DD/YYYY`, `2024Q2`) to the quarter end and drops filings with an unusable report date.
- The sample dataset gains a prior quarter: every fund reports for 2024-03-31 and 2024-06-30, 820 filings and 24,336 positions.
- `as_of` on `/entities/{id}/exposure` and `/trades` selects the latest period on or before the given date; without it the latest period of all is used.
- `GET /periods` lists the periods held in the store and `GET /positions/delta?entity=&from=&to=` reports the lines a holder opened, closed and moved.
- The explorer exposure panel gains a period selector and shows the period each answer was computed over.
- Tests: 30 ETL pytest, 35 API unit and 19 Testcontainers integration, 8 explorer specs.

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
