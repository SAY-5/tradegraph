# TradeGraph

Counterparty knowledge graph built from SEC filings. A Python ETL turns EDGAR
data (company tickers and 13F-HR holdings live, plus Exhibit 21 style subsidiary
lists in the committed sample) into
RDF that follows a compact FIBO-inspired ontology, loads it into a SPARQL 1.1
store, and a Spring Boot API answers lineage and exposure questions over it with
SPARQL property paths. An Angular explorer renders the neighbourhood graph, the
corporate tree and the exposure breakdown with a path explanation for every
contributing position.

```
                +-------------------+        Graph Store Protocol        +---------------------+
 SEC EDGAR ---> |  etl/ (Python)    | ---------------------------------> |  Stardog            |
 (live or       |  company tickers  |   entities.nt  positions.nt        |  or Apache Jena     |
  sample)       |  13F-HR, Ex. 21   |   ontology.nt  (named graphs)      |  Fuseki             |
                +-------------------+                                    +----------+----------+
                                                                                    | SPARQL 1.1 Protocol
                +-------------------+        REST / JSON                 +----------+----------+
 browser <----> | explorer/ (Angular)| <-------------------------------> | api/ (Spring Boot)  |
                | d3 graph, lineage, |   /entities /lineage /exposure    | query templates,    |
                | exposure panels    |   /trades /graph /stats           | Caffeine cache      |
                +-------------------+                                    +---------------------+
```

## Stardog and Fuseki

Stardog is the target store. `deploy/docker-compose.stardog.yml` runs the
official `stardog/stardog` image with a license mounted from `STARDOG_LICENSE`,
and `api/src/main/resources/application-stardog.yml` holds the Stardog
specific settings (query endpoint, credentials, optional `reasoning=true`).
Stardog needs a license key, so everything that has to run unattended (the
test suite, CI and `make demo`) runs the same SPARQL against Apache Jena Fuseki
from `deploy/docker-compose.yml`. Both stores are reached through the SPARQL
1.1 Protocol for queries and the Graph Store Protocol for loading, so the ETL,
the query templates and the API do not change between them. The numbers in
this README come from Fuseki; Stardog was not exercised in this repository.

## Quick start

Requirements: Docker, Java 21, Maven, `uv` (Python 3.12), Node 22.

```
make setup        # uv sync, mvn dependency:go-offline, npm ci
make lint         # ruff, checkstyle, eslint
make test         # pytest, mvn verify (Testcontainers Fuseki), vitest + production build
make demo         # Fuseki + ETL sample + API + scripted queries, prints the summary below
make web          # browser demo: types, bundle, self check, payload weight, slice drift
make etl-validate # SHACL shapes and the quality report into etl/build/quality.json
make api          # API on :8080 against Fuseki (profile fuseki)
make explorer     # Angular dev server on :4200, proxies /api to :8080
```

`make demo` output, unedited. `scripts/demo_queries.py` writes the same figures to
`web/src/data/demo-summary.json` with the commit, host and timestamp of the run, which is
what the browser demo quotes and what the self check asserts against:

```
TradeGraph demo summary
=======================
store            : fuseki (http://localhost:3030/ds/sparql)
entities loaded  : 6,100 (issuers 3,600, funds 410, subsidiaries 2,148)
positions        : 24,336 in 1,240 filings
lineage edges    : 2,500
triples          : 323,173
stats query      : 205 ms

Lineage (subsidiaryOf property paths, depth limited to 5)
  Apple Inc.: 6 descendants, deepest level 2, 51 ms
  JPMORGAN CHASE & CO: 7 descendants, deepest level 1, 28 ms
  Invesco Ltd.: 7 descendants, deepest level 1, 26 ms

Exposure (fund family to issuer, through affiliates and subsidiaries, 72 queries)
  PRICE T ROWE GROUP INC -> Apple Inc.
    total $2,475,300,433  direct $0  via subsidiaries $0  via affiliates $2,475,300,433
    3 positions across 3 instrument lines, 3 holders, longest path 2 hops, 65 ms
    longest path: PRICE T ROWE GROUP INC, whose subsidiary Price T ROWE Global Select Fund holds COMMON AAPL issued by Apple Inc.
  BlackRock, Inc. -> Meta Platforms, Inc.
    total $1,980,265,856  direct $0  via subsidiaries $0  via affiliates $1,980,265,856
    3 positions across 3 instrument lines, 3 holders, longest path 2 hops, 69 ms
    longest path: BlackRock, Inc., whose subsidiary Blackrock International Value Fund holds PUT META issued by Meta Platforms, Inc.
  Invesco Ltd. -> Apple Inc.
    total $1,523,775,489  direct $0  via subsidiaries $0  via affiliates $1,523,775,489
    2 positions across 2 instrument lines, 2 holders, longest path 2 hops, 69 ms
    longest path: Invesco Ltd., whose subsidiary Invesco Dividend Focus Fund holds COMMON AAPL issued by Apple Inc.
  exposure through an issuer subsidiary: TPG Inc. -> Nu Holdings Ltd.
    $4,792,566 of total $4,792,566 is issued by Nu Finance Corp., 3 hops, 59 ms
    path: TPG Inc., whose subsidiary TPG Global Select Fund holds DEBT issued by Nu Finance Corp. is a subsidiary of Nu Holdings Ltd.
  26/72 pairs have exposure; latency p50 57 ms, max 110 ms (uncached, Fuseki)
  repeated query served from cache in 2 ms

Operations (/ops/overview)
  store          : fuseki reasoning=false, 323,173 triples, exposure depth <= 4, lineage depth <= 5
  cache          : 33 hits, 139 misses, hit ratio 0.19, 139 entries across 11 caches
  slowest queries: search 50 ms, periods 33 ms, periods 29 ms, periods 28 ms, periods 28 ms
  data quality   : conforms=true, dangling 0, cycles 0, missing identifiers 0, shape violations 0 (checked 2026-09-10T10:10:29Z)
  cost guard     : depth=9 answered 422
```

Issuer and fund manager identities in the sample are real (SEC
`company_tickers.json`); holdings, subsidiaries and values are synthetic and
deterministic. See `etl/sample/README.md`. The `--live` ETL mode pulls real
13F-HR information tables from `data.sec.gov` with a compliant User-Agent. It
builds issuers and holdings only: there is no Exhibit 21 reader in the live
path, so no `subsidiaryOf` edges come out of it, and lineage and the exposure
legs that walk subsidiaries need `--sample`.

## Browser demo

`web/` is a static page that answers the same lineage and exposure questions with no API
and no store: the ontology triples, the query semantics and the SPARQL templates are the
ones in this repository, running over a 572 KiB slice of `etl/sample` (1,760 of 6,100
entities, 7,894 of 24,336 positions, both reporting periods, ownership fractions
included). The four exposure pairs above reproduce to the dollar and `npm run selfcheck`
asserts it against the same `demo-summary.json` this block was generated from. The
milliseconds do not carry over, because the demo times function calls rather than an API
and a store, so the page quotes the measured latency and labels it with the run that
produced it. `make web` also asserts the payload weight and regenerates the slice to
check it against the committed copy. See `web/README.md`.

## Components

| Directory | Stack | What it does |
|---|---|---|
| `ontology/` | OWL / Turtle | `tradegraph.ttl` and `shapes.ttl` (SHACL): LegalEntity, Counterparty, Issuer, Fund, Subsidiary, Position, Trade, Instrument, Filing; `subsidiaryOf` (transitive), `hasSubsidiary`, `ownershipFraction`, `counterpartyOf`, `holds`, `issuer`, `filedIn`, `cik`, `lei`, `ticker`, `name` |
| `etl/` | Python 3.12, rdflib, pyshacl, httpx, click | `tradegraph-etl build --sample|--live`, `load --endpoint URL --store fuseki|stardog [--since]`, `validate`, `stats`; normalises reported periods and emits one N-Triples file per named graph |
| `api/` | Java 21, Spring Boot 3.5, Caffeine, Micrometer, Testcontainers | SPARQL client, query templates, cost guard, lineage and exposure services, REST endpoints, store health indicator and ops overview |
| `explorer/` | Angular 22 standalone, d3 7, vitest | search, force-directed neighbour graph with expand-on-click, lineage tree, exposure panel with path explanations |
| `deploy/` | Docker Compose | Fuseki stack, Fuseki inference profile, Stardog stack, multi-stage Dockerfiles, nginx proxy for the explorer |
| `web/` | Vite, React 18, TypeScript, d3-force 3 | Static browser demo over a committed slice of the sample, no backend |

## API

Entity ids are the SEC CIK (ten digits) for issuers and 13F filers, and
`S...` / `F...` identifiers for subsidiaries and sub-funds; the IRI is
`https://tradegraph.dev/entity/{id}`.

| Endpoint | Description |
|---|---|
| `GET /entities?q=&limit=` | Search by name (substring), ticker or CIK; ticker matches first |
| `GET /entities/{id}` | Detail: identifiers, parent, counts and values of positions held and issued |
| `GET /entities/{id}/lineage?depth=` | Ancestors nearest first, ultimate parent, descendant tree (depth limited, default 5) |
| `GET /entities/{id}/exposure?issuer=&includeAffiliates=&includeSubsidiaries=&weighted=&depth=&as_of=` | Aggregate value of positions held by the fund (and the funds in its family) on instruments issued by the issuer (and its subsidiaries), grouped by instrument and holder, each line with `lineagePath`, `pathLength` and `explanation` |
| `GET /exposure/concentration?entity=&limit=&min_share=&as_of=` | Issuers that make up at least `min_share` of what the fund family holds, largest first |
| `GET /trades?entity=&limit=&offset=&as_of=` | Positions where the entity is holder or issuer, largest first |
| `GET /periods` | Reporting periods held in the store, newest first |
| `GET /positions/delta?entity=&from=&to=` | Lines the entity opened, closed and moved between two reporting periods |
| `GET /graph/neighbors/{id}?limit=` | Parent, subsidiaries and strongest holding links for the explorer |
| `GET /stats` | Entity, position, filing, lineage edge and triple counts |
| `GET /quality` | The report `tradegraph-etl validate` wrote for the data that was last loaded |
| `GET /ops/overview` | Store, triple count, cache hit ratio, the slowest recent queries and the last quality summary |
| `GET /actuator/health` | Includes a `store` component that runs `ASK {}` against the store |
| `GET /actuator/metrics/tradegraph.sparql` | Query latency by template |

Errors use RFC 9457 problem details: 400 for malformed ids, short queries or a
malformed date, 404 for unknown entities, 422 when a request costs more than
the configuration allows, 502 when the store fails. The two depth limits are
separate: `tradegraph.exposure.max-depth` is 4 and `tradegraph.lineage.max-depth`
is 5, and asking for more is a 422 rather than a silent clamp.

A 13F-HR reports a quarter end, so every position carries the period of the
filing it came from and a query that did not pin a period would sum the same
holding once per quarter. Exposure, `/trades` and the delta report therefore
answer over exactly one period: `as_of` selects the latest period on or before
the given date, and without it the latest period of all is used. `as_of` before
the first filed period returns an empty answer with a null `asOf`.

`weighted=true` multiplies every line by the ownership along its lineage path.
An Exhibit 21 line states how much of a subsidiary its parent owns, so a
position on an entity two hops below an issuer, owned 75 percent by its parent
which is in turn owned 80 percent, counts 0.6 towards exposure to that issuer.
A hop with no disclosed percentage is treated as wholly owned and carries
`tg:ownershipAssumed true`. Unweighted answers are unchanged and omit `weight`
and `weightedValue`.

Exposure buckets partition the total: `directValue` is the fund holding the
issuer itself, `viaSubsidiariesValue` is the fund holding an instrument issued
by one of the issuer's subsidiaries, and `viaAffiliatesValue` is anything held
by another fund in the same corporate family, whether on the issuer or on a
subsidiary. Each line also carries `viaAffiliate` and `viaSubsidiary` flags.

## Data quality

`ontology/shapes.ttl` holds SHACL shapes for the vocabulary: cardinality,
datatypes, the ten digit CIK pattern, ownership fractions between 0 and 1 and
the closed instrument class vocabulary. `tradegraph-etl validate --sample` runs
them with pyshacl and adds the three checks that are properties of the dataset
rather than of one node, dangling references, `subsidiaryOf` cycles and issuers
carrying neither a CIK nor a ticker. The result goes to `etl/build/quality.json`
and the API serves it at `GET /quality`; `--fail-on-violation` makes the command
exit non zero, which is what CI uses. The shapes found one real defect on their
first run: the Exhibit 21 filing of a listed asset manager shared an accession
number with its own first 13F, so the sample now numbers 13F filings from 1000.

`tradegraph-etl load --since TIMESTAMP` pushes only the graph files modified at
or after that time, so reloading after a build that touched one graph replaces
one graph instead of all three.

## Operations

`GET /ops/overview` answers what an operator asks first: which store is behind
the API and how many triples it holds, the Caffeine hit ratio across the
caches, the slowest queries still in a 200 entry ring buffer, the two depth
limits and the headline of the last `tradegraph-etl validate` run. Query latency
is also a Micrometer timer tagged with the template name, at
`/actuator/metrics/tradegraph.sparql`.

Stardog answers with `reasoning=true`; `deploy/fuseki/assembler-inference.ttl`
and `deploy/fuseki/tradegraph.rules` give Fuseki the same two entailments the
API depends on, the transitive closure of `subsidiaryOf` and the inverse
`hasSubsidiary`, through a Jena generic rule reasoner on a second read only
service at `/ds-inf`:

```
docker compose -f deploy/docker-compose.yml --profile inference up -d fuseki-inference
```

With `tradegraph.store.reasoning=true` the exposure and concentration clauses
ask for one hop instead of the bounded alternation, and the lineage queries add
a filter so the chain walk still sees only direct parents. `ReasoningParityIT`
loads the fixture into that service and asserts the exposure total is the same
with reasoning on as with the explicit property path, and that the two hop
`subsidiaryOf` and `hasSubsidiary` edges exist only on the reasoning service.

## Ontology summary

```
tg:LegalEntity
  tg:Counterparty (subclass)
    tg:Issuer, tg:Fund
  tg:Subsidiary
tg:Position (tg:Trade subclass)  tg:Instrument  tg:Filing

tg:subsidiaryOf (transitive)  tg:hasSubsidiary (inverse)  tg:hasParent (equivalent)
tg:ownershipFraction, tg:ownershipAssumed
tg:counterpartyOf (symmetric)
tg:holds / tg:heldBy, tg:instrument, tg:issuedBy, tg:issuer, tg:quantity, tg:value, tg:asOf
tg:filedIn, tg:filedBy, tg:formType, tg:accessionNumber, tg:periodOfReport
tg:cik, tg:lei, tg:ticker, tg:name, tg:jurisdiction, tg:sic, tg:cusip, tg:instrumentClass
```

Named graphs: `https://tradegraph.dev/graph/entities`, `.../positions`,
`.../ontology`. Both stores query the union of named graphs by default.

## Tests

- `etl/`: 47 pytest tests covering RDF mapping, period parsing, ownership fractions and their assumed flag, sample size (>= 5,000 entities), the two reporting periods in the sample, an injected `subsidiaryOf` cycle and dangling reference, SHACL conformance, incremental loads that push only the graph that moved, lineage depth, idempotent Graph Store loads against an in-process server, 13F information table parsing, the live path against recorded EDGAR responses (including that it emits no `subsidiaryOf` triple), and the triple and entity counts the browser demo's manifest records.
- `api/`: 60 unit tests (SPARQL escaping and id validation, position identifiers, bounded property paths, inline data blocks, template rendering, the cost guard over every shipped template, query timings, lineage ordering, exposure path building, position delta matching, ownership products, concentration ranking, quality report reading) and 31 integration tests with Testcontainers Fuseki, including `TemporalIT` over a two period store, `ReasoningParityIT` against a Fuseki rule reasoner, `NeighborLimitIT` over an issuer with more holders than the row limit allows, and `ExposurePerformanceIT`, which loads the full sample and asserts that uncached exposure answers stay under 1,500 ms. That test writes what it measured to `api/target/benchmarks/exposure-latency.txt`, with the dataset, the JVM and the host it ran on, and CI keeps the file as an artifact.
- `explorer/`: 9 vitest specs (API client URLs, graph merging, exposure panel rendering, weighted values, the period selector, app shell) plus ESLint and a production build.

See `ARCHITECTURE.md` for the query design and `CONTRIBUTING.md` for the workflow.

## Releases

Tagged releases, newest last. `CHANGELOG.md` has the detail.

| Version | Date | What it added |
|---|---|---|
| [v1.0.0](https://github.com/SAY-5/tradegraph/releases/tag/v1.0.0) | 2026-09-10 | Baseline: ETL, SPARQL API, Angular explorer, Fuseki and Stardog stacks |
| [v2.0.0](https://github.com/SAY-5/tradegraph/releases/tag/v2.0.0) | 2026-09-10 | Temporal filings: reporting periods on positions, `as_of` queries, `/positions/delta`, period selector |
| [v3.0.0](https://github.com/SAY-5/tradegraph/releases/tag/v3.0.0) | 2026-09-10 | Ownership weighting: fractions on `subsidiaryOf` edges, weighted exposure, `/exposure/concentration` |
| [v4.0.0](https://github.com/SAY-5/tradegraph/releases/tag/v4.0.0) | 2026-09-10 | Data quality: SHACL shapes, `tradegraph-etl validate`, `/quality`, incremental `load --since` |
| [v5.0.0](https://github.com/SAY-5/tradegraph/releases/tag/v5.0.0) | 2026-09-10 | Operations: `/ops/overview`, query cost guard, Micrometer timers, Fuseki inference profile |

## License

MIT
