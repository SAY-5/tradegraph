# TradeGraph

Counterparty knowledge graph built from SEC filings. A Python ETL turns EDGAR
data (company tickers, 13F-HR holdings, Exhibit 21 style subsidiary lists) into
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
make setup      # uv sync, mvn dependency:go-offline, npm ci
make lint       # ruff, checkstyle, eslint
make test       # pytest, mvn verify (Testcontainers Fuseki), vitest + production build
make demo       # Fuseki + ETL sample + API + scripted queries, prints the summary below
make api        # API on :8080 against Fuseki (profile fuseki)
make explorer   # Angular dev server on :4200, proxies /api to :8080
```

`make demo` output, unedited:

```
TradeGraph demo summary
=======================
store            : fuseki (http://localhost:3030/ds/sparql)
entities loaded  : 6,100 (issuers 3,600, funds 410, subsidiaries 2,148)
positions        : 12,373 in 829 filings
lineage edges    : 2,500
triples          : 207,095
stats query      : 552 ms

Lineage (subsidiaryOf property paths, depth limited to 5)
  Apple Inc.: 6 descendants, deepest level 2, 79 ms
  JPMORGAN CHASE & CO: 7 descendants, deepest level 1, 51 ms
  Invesco Ltd.: 7 descendants, deepest level 1, 57 ms

Exposure (fund family to issuer, through affiliates and subsidiaries, 72 queries)
  PRICE T ROWE GROUP INC -> Apple Inc.
    total $2,475,300,433  direct $0  via subsidiaries $0  via affiliates $2,475,300,433
    3 positions across 3 instrument lines, 3 holders, longest path 2 hops, 64 ms
    longest path: PRICE T ROWE GROUP INC, whose subsidiary Price T ROWE Global Select Fund holds COMMON AAPL issued by Apple Inc.
  BlackRock, Inc. -> Meta Platforms, Inc.
    total $1,980,265,856  direct $0  via subsidiaries $0  via affiliates $1,980,265,856
    3 positions across 3 instrument lines, 3 holders, longest path 2 hops, 56 ms
    longest path: BlackRock, Inc., whose subsidiary Blackrock International Value Fund holds PUT META issued by Meta Platforms, Inc.
  Invesco Ltd. -> Apple Inc.
    total $1,523,775,489  direct $0  via subsidiaries $0  via affiliates $1,523,775,489
    2 positions across 2 instrument lines, 2 holders, longest path 2 hops, 193 ms
    longest path: Invesco Ltd., whose subsidiary Invesco Dividend Focus Fund holds COMMON AAPL issued by Apple Inc.
  exposure through an issuer subsidiary: TPG Inc. -> Nu Holdings Ltd.
    $4,792,566 of total $4,792,566 is issued by Nu Finance Corp., 3 hops, 43 ms
    path: TPG Inc., whose subsidiary TPG Global Select Fund holds DEBT issued by Nu Finance Corp. is a subsidiary of Nu Holdings Ltd.
  26/72 pairs have exposure; latency p50 64 ms, max 1411 ms (uncached, Fuseki)
  repeated query served from cache in 2 ms
```

Issuer and fund manager identities in the sample are real (SEC
`company_tickers.json`); holdings, subsidiaries and values are synthetic and
deterministic. See `etl/sample/README.md`. The `--live` ETL mode pulls real
13F-HR information tables from `data.sec.gov` with a compliant User-Agent.

## Components

| Directory | Stack | What it does |
|---|---|---|
| `ontology/` | OWL / Turtle | `tradegraph.ttl`: LegalEntity, Counterparty, Issuer, Fund, Subsidiary, Position, Trade, Instrument, Filing; `subsidiaryOf` (transitive), `hasSubsidiary`, `counterpartyOf`, `holds`, `issuer`, `filedIn`, `cik`, `lei`, `ticker`, `name` |
| `etl/` | Python 3.12, rdflib, httpx, click | `tradegraph-etl build --sample|--live`, `load --endpoint URL --store fuseki|stardog`, `stats`; emits one N-Triples file per named graph |
| `api/` | Java 21, Spring Boot 3.5, Caffeine, Testcontainers | SPARQL client, query templates, lineage and exposure services, REST endpoints, store health indicator |
| `explorer/` | Angular 22 standalone, d3 7, vitest | search, force-directed neighbour graph with expand-on-click, lineage tree, exposure panel with path explanations |
| `deploy/` | Docker Compose | Fuseki stack, Stardog stack, multi-stage Dockerfiles, nginx proxy for the explorer |

## API

Entity ids are the SEC CIK (ten digits) for issuers and 13F filers, and
`S...` / `F...` identifiers for subsidiaries and sub-funds; the IRI is
`https://tradegraph.dev/entity/{id}`.

| Endpoint | Description |
|---|---|
| `GET /entities?q=&limit=` | Search by name (substring), ticker or CIK; ticker matches first |
| `GET /entities/{id}` | Detail: identifiers, parent, counts and values of positions held and issued |
| `GET /entities/{id}/lineage?depth=` | Ancestors nearest first, ultimate parent, descendant tree (depth limited, default 5) |
| `GET /entities/{id}/exposure?issuer=&includeAffiliates=&includeSubsidiaries=&depth=` | Aggregate value of positions held by the fund (and the funds in its family) on instruments issued by the issuer (and its subsidiaries), grouped by instrument and holder, each line with `lineagePath`, `pathLength` and `explanation` |
| `GET /trades?entity=&limit=&offset=` | Positions where the entity is holder or issuer, largest first |
| `GET /graph/neighbors/{id}?limit=` | Parent, subsidiaries and strongest holding links for the explorer |
| `GET /stats` | Entity, position, filing, lineage edge and triple counts |
| `GET /actuator/health` | Includes a `store` component that runs `ASK {}` against the store |

Errors use RFC 9457 problem details: 400 for malformed ids or short queries,
404 for unknown entities, 502 when the store fails.

Exposure buckets partition the total: `directValue` is the fund holding the
issuer itself, `viaSubsidiariesValue` is the fund holding an instrument issued
by one of the issuer's subsidiaries, and `viaAffiliatesValue` is anything held
by another fund in the same corporate family, whether on the issuer or on a
subsidiary. Each line also carries `viaAffiliate` and `viaSubsidiary` flags.

## Ontology summary

```
tg:LegalEntity
  tg:Counterparty (subclass)
    tg:Issuer, tg:Fund
  tg:Subsidiary
tg:Position (tg:Trade subclass)  tg:Instrument  tg:Filing

tg:subsidiaryOf (transitive)  tg:hasSubsidiary (inverse)  tg:hasParent (equivalent)
tg:counterpartyOf (symmetric)
tg:holds / tg:heldBy, tg:instrument, tg:issuedBy, tg:issuer, tg:quantity, tg:value, tg:asOf
tg:filedIn, tg:filedBy, tg:formType, tg:accessionNumber, tg:periodOfReport
tg:cik, tg:lei, tg:ticker, tg:name, tg:jurisdiction, tg:sic, tg:cusip, tg:instrumentClass
```

Named graphs: `https://tradegraph.dev/graph/entities`, `.../positions`,
`.../ontology`. Both stores query the union of named graphs by default.

## Tests

- `etl/`: 20 pytest tests covering RDF mapping, sample size (>= 5,000 entities), dangling references, lineage depth, idempotent Graph Store loads against an in-process server, and 13F information table parsing.
- `api/`: 30 unit tests (SPARQL escaping and id validation, bounded property paths, template rendering, lineage ordering, exposure path building) and 12 integration tests with Testcontainers Fuseki, including `ExposurePerformanceIT`, which loads the full sample and asserts that uncached exposure answers stay under 1,500 ms (observed max 153 ms on an idle host, 1,023 ms with the host under load).
- `explorer/`: 7 vitest specs (API client URLs, graph merging, exposure panel rendering, app shell) plus ESLint and a production build.

See `ARCHITECTURE.md` for the query design and `CONTRIBUTING.md` for the workflow.

## License

MIT
