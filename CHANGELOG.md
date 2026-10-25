# Changelog

All notable changes to TradeGraph are recorded here. Versions follow semantic
versioning and each one is tagged `vMAJOR.MINOR.PATCH`.

## [5.1.2] - 2026-10-25

Dependency refresh. An OSV scan of the lockfiles and the API's pom flagged 18
packages with published advisories and flags none after it. Nothing changes
outside the manifests, the lockfiles, the version numbers and the documentation.

- The API's Spring Boot parent moves from 3.5.3 to 3.5.16, the newest 3.5 release, past GHSA-wwpq-f5c3-7hvx (fixed in 3.5.14). The advisory needs a local user on the same host to take over the `ApplicationTemp` directory, and the impact it describes runs through `server.servlet.session.persistent`, which the API does not set.
- The ETL's certifi moves from 2026.7.22 to 2026.10.19 (GHSA-6q48-6c7w-9gw2), which drops the `emSign ECC Root CA - G3` root whose intermediates had compromised keys. httpx takes its CA bundle from certifi, so `--live` checks the SEC EDGAR certificate against the new bundle.
- The explorer's Angular framework packages move together from 22.1.5 to 22.2.1, the first 22.x release clear of the three `@angular/router` advisories (GHSA-ff3f-86qr-9cv3, GHSA-62vg-58rm-qff7, GHSA-57xq-rjx2-v5xh). All three are denial of service in server side rendering; the explorer is a browser only build, and its source imports neither `@angular/router` nor `@angular/forms`.
- `@angular/build` and `@angular/cli` move together from 22.1.7 to 22.2.3. The 22.1 tooling pinned piscina 5.2.0 (GHSA-67c8-pqhq-4rmx), `@modelcontextprotocol/sdk` 1.30.0 (GHSA-22jm-h49p-29qw, GHSA-46jr-4wx8-v453, GHSA-6prh-2h8m-c8cw, GHSA-6qxp-vccf-f47h, GHSA-rvq5-wwqv-78pq) and zod 4.4.3 (GHSA-mrhx-c7xc-m3w5) exactly. 22.2.3 pins piscina 5.3.2 and zod 4.6.6, and is the first CLI release whose zod pin is fixed; its MCP server is built on `@modelcontextprotocol/server` 2.3.1, so the SDK left the tree, and with it express, express-rate-limit and the four flagged packages they and the SDK pulled in: body-parser 2.3.0 (GHSA-27r3-jxmh-p828), proxy-addr 2.0.7 (GHSA-jqcg-44mw-7w3h), hono 4.13.7 (GHSA-5r4p-p66f-jhc7) and ip-address 10.7.0 (GHSA-h3mg-xc3c-68pw, GHSA-j6r3-76f7-8jcv, GHSA-rxp7-6hxx-x8q5).
- Every `@angular/build` 22.2 release pins vite 8.3.0, which still carries the five advisories flagged on the explorer's vite 8.1.5 (GHSA-587h-7wmj-h5pm, GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw, GHSA-9jrq-w75r-8gcw, GHSA-rq7h-c2jc-7f22) and adds GHSA-vfpm-58rq-9qcg, so `explorer/package.json` overrides vite to 8.3.3. All six concern the development server, two of them only on Windows.
- vitest and `@vitest/mocker` move from 4.1.11 to 4.1.12 (GHSA-qxg6-89mg-rqv8, GHSA-xp26-3454-mjgp), brace-expansion from 5.0.9 to 5.0.12 (GHSA-6j4f-fj2g-mc7p, GHSA-qhr7-859c-m2p7, GHSA-q2hr-2g5m-vwhr), fast-uri from 3.1.7 to 3.1.9 (GHSA-333x-w4r6-6crp, GHSA-hrr3-gc8f-f4qj, GHSA-w74x-v6f9-j3xg, GHSA-wjr9-j795-jxcr, GHSA-xhq7-xmqj-769h), source-map-js from 1.2.1 to 1.2.2 (GHSA-68fv-2mgg-jv7q) and undici from 7.29.1 to 7.30.1 (GHSA-4qv8-2p9j-2685, GHSA-f72v-6w45-q472, GHSA-xjj6-f33q-929c), each inside the range its dependents declare.
- Of the fourteen flagged explorer packages only `@angular/router` and zod are in the production dependency tree, zod through `@angular/forms`. The other twelve belong to the Angular CLI and build, vitest and jsdom, which the application code does not import; the explorer image serves only what `ng build` writes to `dist/explorer/browser`.
- The web demo's vite moves from 6.4.3 to 6.4.4, past the same five development server advisories, and source-map-js from 1.2.1 to 1.2.2; both are development dependencies of the static build.
- `explorer/package-lock.json` records the package's own name and version, `tradegraph-explorer` 5.1.2, where it read `explorer` 0.0.0.
- Tests: 47 ETL pytest, 60 API unit and 34 Testcontainers integration, 9 explorer specs, 135 browser demo self check assertions.

## [5.1.1] - 2026-09-28

Browser demo fixes. Nothing outside `web/` changes apart from the version
numbers and the documentation.

- The neighbourhood graph places its labels: `ForceGraph.tsx` tries the spot along the spoke, level with the node, above or below it, and on the side facing the centre, and keeps the first that stays inside the view and clears every label already placed and every other node. A label with no such spot is left out, except the centre's, and the node keeps its full name in its accessible name and its tooltip. In 5.1.0 every label was drawn on its spoke with no check against the others.
- The lists under the graph name every node it draws: one for the selected entity and one per expansion, lineage first and then holdings by value. 5.1.0 had a single list that treated every drawn edge as if it touched the selected entity, so the nodes an expansion added were mostly missing from it; expanding Price T ROWE Global Select Fund from Apple draws 49 nodes and left 16 of them unnamed.
- `npm run selfcheck` reads the demo block pasted into `README.md` back and fails when a figure it shares with `web/src/data/demo-summary.json` differs, and checks the same figures where the README's browser demo paragraph, `web/README.md`, `etl/sample/README.md` and `ARCHITECTURE.md` quote them. Dollar totals are rounded half to even, as `scripts/demo_queries.py` prints them.
- `web/README.md` quotes the payload at this commit: 844,919 B on disk and 241,422 B gzipped.
- The ETL package declares 5.1.1 in `etl/pyproject.toml` and `tradegraph_etl.__version__`, which read 5.0.0 and 1.0.0 in 5.1.0.
- Tests: 47 ETL pytest, 60 API unit and 34 Testcontainers integration, 9 explorer specs, 135 browser demo self check assertions.

## [5.1.0] - 2026-09-26

Correctness and provenance pass over the whole repository. No new endpoints:
the changes make the claims in the documents follow from the code and the data.

- `neighbors.rq` ranks lineage above holdings, so the row limit truncates holdings rather than the parent and subsidiary edges the explorer draws the corporate tree from. Ordering by the relation name sorted `HELD_BY` and `HOLDS` ahead of `PARENT` and `SUBSIDIARY`, so a well held issuer such as Apple, which has 27 distinct holders and five direct subsidiaries in the sample, kept three of those five lineage edges at the explorer's initial thirty row request and none at its fifteen row expansion. `NeighborLimitIT` covers it, and two of its three cases fail against the previous `ORDER BY`.
- `ExplorerGraphIT` runs the endpoints the explorer calls against the full sample rather than the six entity fixture, which is where row limits, ordering and truncation behave differently at all: it asserts Apple's five subsidiary edges survive the fifteen row request, the six descendant tree the demo documents, and a concentration page that stays capped while the count above the threshold covers the family.
- The query cost guard runs over every template as `QueryTemplates` loads it instead of over every rendered query, where the pattern also matched inside a caller's quoted literal and answered 422 to ordinary search terms such as `tg:x+`.
- `/exposure/concentration` is bounded in the store: a ranked page with `HAVING` and `LIMIT`, plus one row each for the family total and the number of issuers above the threshold. It previously returned a row per issuer the family held, which is up to 276 rows in the committed sample.
- The property path lab renders the lineage templates again. The committed slice predated the `${directOnly}` placeholder `lineage_up.rq` and `lineage_down.rq` gained, so the page quoted stale SPARQL and regenerating the slice would have thrown on the unresolved placeholder. The browser renderers now pass that parameter the way `LineageService` renders it with reasoning off, the concentration tab renders the floor and the limit the API sends, the self check renders all five tabs and asserts no placeholder survives, and every section of the page sits behind an error boundary.
- The live ETL path states what it reads. There is no Exhibit 21 reader in `--live`, so it produces holdings and no corporate tree, and a test asserts the transform emits no `subsidiaryOf` triple from live data.
- `scripts/demo_queries.py --summary PATH` writes the dataset counts, the exposure latencies and the commit, host and timestamp that produced them; `make demo` points it at `web/src/data/demo-summary.json`, and the README demo block and the browser demo both quote that file instead of transcribing numbers.
- `ExposurePerformanceIT` writes its latencies to `target/benchmarks/exposure-latency.txt` and fails rather than skipping when `TRADEGRAPH_REQUIRE_SAMPLE=1`, which CI now sets, so a missing artifact cannot become a silent pass. CI keeps the file as an artifact and `make bench` reproduces it; `docs/benchmarks/2026-09-15-exposure-latency.txt` records two runs with the dataset, JVM, host and commit behind them, in place of the two exposure latencies the README used to quote with no artifact behind either.
- CI gained a `web` job: type check, bundle, self check, payload weight against ceilings of 1,100,000 B on disk and 300,000 B gzipped, and a slice drift gate that regenerates the slice and fails on any diff. `make web` runs the same steps locally.
- Browser demo: the hero leads with the figures the page computes and names the full sample beside them, the interactive SVGs are no longer labelled as images, Space activates a node without scrolling the page, the neighbourhood graph has a parallel list of buttons, count up animations announce the settled number once, the dimmest text token measures 6.25:1 on the page background, and the payload dropped the full `d3` package and the five templates the page never shows.
- A position id comes from its own namespace constant rather than a string rewrite of the entity namespace.
- `etl/tests/test_manifest_parity.py` asserts the ontology, triple, entity and position counts in the slice manifest against what rdflib counts over the same sample, so the figures the browser demo commits cannot drift from the ones the ETL produces.
- Documentation: the cache list, the `--funds` limit, the CLI command list and the contributor lint command now match the code, and the explorer's test fixture records the dataset the sample actually holds.
- Tests: 47 ETL pytest, 60 API unit and 34 Testcontainers integration, 9 explorer specs, 104 browser demo self check assertions.

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
- `web/`: the browser demo page itself: hero, ontology map, explorer with the force graph and lineage tree, exposure section, property path lab and the full run block, with `web/README.md` and a link from the top-level README.

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
- `web/`: the browser demo's in-memory triple store, the query functions that mirror the API hop for hop, and `scripts/extract-slice.ts`, which commits a deterministic slice of the ETL sample with a manifest that `scripts/selfcheck.ts` asserts.

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
- `web/`: Vite, React and TypeScript scaffold for the browser demo; no page yet.
