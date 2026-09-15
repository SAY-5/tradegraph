# Changelog

All notable changes to TradeGraph are recorded here. Versions follow semantic
versioning and each one is tagged `vN.0.0`.

## [Unreleased]

Correctness and provenance pass over the whole repository. No new endpoints:
the changes make the claims in the documents follow from the code and the data.

- `neighbors.rq` ranks lineage above holdings, so the row limit truncates holdings rather than the parent and subsidiary edges the explorer draws the corporate tree from. Ordering by the relation name sorted `HELD_BY` and `HOLDS` ahead of `PARENT` and `SUBSIDIARY`, which left a well held issuer such as Apple with no lineage edges at the limits the explorer asks for. `NeighborLimitIT` covers it.
- The query cost guard runs over every template as `QueryTemplates` loads it instead of over every rendered query, where the pattern also matched inside a caller's quoted literal and answered 422 to ordinary search terms such as `tg:x+`.
- `/exposure/concentration` is bounded in the store: a ranked page with `HAVING` and `LIMIT`, plus one row each for the family total and the number of issuers above the threshold. It previously returned a row per issuer the family held, which is up to 276 rows in the committed sample.
- The live ETL path states what it reads. There is no Exhibit 21 reader in `--live`, so it produces holdings and no corporate tree, and a test asserts the transform emits no `subsidiaryOf` triple from live data.
- `scripts/demo_queries.py --summary` writes `web/src/data/demo-summary.json` with the dataset counts, the exposure latencies and the commit, host and timestamp that produced them. The README demo block and the browser demo both quote that file instead of transcribing numbers.
- `ExposurePerformanceIT` writes its latencies to `target/benchmarks/exposure-latency.txt` and fails rather than skipping when `TRADEGRAPH_REQUIRE_SAMPLE=1`, which CI now sets, so a missing artifact cannot become a silent pass.
- CI gained a `web` job: type check, bundle, self check, payload weight, and a slice drift gate that regenerates the slice and fails on any diff. `make web` runs the same steps locally.
- Browser demo: the hero leads with the figures the page computes and names the full sample beside them, the interactive SVGs are no longer labelled as images, Space activates a node without scrolling the page, the neighbourhood graph has a parallel list of buttons, count up animations announce the settled number once, and the payload dropped the full `d3` package and the five templates the page never shows.
- A position id comes from its own namespace constant rather than a string rewrite of the entity namespace.
- Documentation: the cache list, the `--funds` limit, the CLI command list and the contributor lint command now match the code, and the explorer's test fixture records the dataset the sample actually holds.

## [5.0.0] - 2026-09-10

Operations. What the API is doing and what it will refuse to do are both
visible now, and Fuseki can be made to reason the way Stardog does.

- `GET /ops/overview`: store and triple count, Caffeine hit ratio across the caches, the slowest queries in a 200 entry ring buffer, both depth limits and the headline of the last quality run.
- A cost guard answers 422 instead of running an unbounded property path or a walk deeper than the configuration allows; `tradegraph.exposure.max-depth` (4) and `tradegraph.lineage.max-depth` (5) are separate limits.
- Micrometer times every query by template at `/actuator/metrics/tradegraph.sparql`, and the caches now record statistics.
- `deploy/fuseki/assembler-inference.ttl` and `tradegraph.rules` add a read only `/ds-inf` service backed by a Jena generic rule reasoner that materialises the transitive closure of `subsidiaryOf` and the inverse `hasSubsidiary`; with `tradegraph.store.reasoning=true` the exposure clauses ask for one hop instead of the bounded alternation.
- `ReasoningParityIT` asserts the exposure total is identical with reasoning on and with the explicit property path.
- The demo script prints the operations overview, and the demo no longer hardcodes the API version in the jar name.
- Tests: 40 ETL pytest, 56 API unit and 27 Testcontainers integration, 9 explorer specs.

## [4.0.0] - 2026-09-10

Data quality. The ETL now says whether what it produced is well formed, and the
API serves that verdict.

- `ontology/shapes.ttl`: SHACL shapes for entities, positions, instruments and filings, covering cardinality, datatypes, the CIK pattern, ownership between 0 and 1 and the closed instrument class vocabulary.
- `tradegraph-etl validate --sample` runs the shapes with pyshacl and adds dangling references, `subsidiaryOf` cycles and issuers with no identifier, writing `etl/build/quality.json`; `--fail-on-violation` exits non zero.
- The shapes caught a real defect: a listed manager's Exhibit 21 filing shared an accession number with its own first 13F, so 13F filings are now numbered from 1000.
- `GET /quality` serves the report of the last load, and a missing report is a 404.
- `tradegraph-etl load --since TIMESTAMP` pushes only the graph files modified at or after that time.
- `lineage_depths` is bounded so cyclic data terminates instead of looping.
- Tests: 40 ETL pytest, 45 API unit and 22 Testcontainers integration, 9 explorer specs.

## [3.0.0] - 2026-09-10

Ownership weighting. Lineage edges carry how much of a subsidiary its parent
owns, and exposure can be read through that ownership instead of counting every
position at face value.

- `tg:ownershipFraction` and `tg:ownershipAssumed` on every entity that has a parent; an Exhibit 21 line without a percentage defaults to 1.0 and is flagged.
- The sample states a percentage for 1,552 of its 2,148 subsidiaries and leaves the rest to the default.
- `weighted=true` on exposure multiplies each line by the product of the fractions along its path and reorders by what is left; unweighted answers are unchanged.
- `GET /exposure/concentration?entity=&limit=&min_share=` lists the issuers that make up at least a share of what a fund family holds, largest first, with `tradegraph.exposure.min-share` as the default threshold.
- The explorer exposure panel gains a weighted toggle and shows the ownership behind each line.
- Tests: 32 ETL pytest, 43 API unit and 21 Testcontainers integration, 9 explorer specs.

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
