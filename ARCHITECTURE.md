# Architecture

## Ontology design

`ontology/tradegraph.ttl` is deliberately small. FIBO models a legal entity,
its control relationships and the instruments it issues with dozens of
classes; TradeGraph keeps the same shape with six classes and a handful of
properties so that every SPARQL query in the API fits on one screen.

- `tg:LegalEntity` is the root. `tg:Counterparty` (entities that appear on a
  side of a position) has the subclasses `tg:Issuer` and `tg:Fund`.
  `tg:Subsidiary` is a legal entity that only exists because an Exhibit 21
  style disclosure lists it under a parent. An asset manager that is listed
  and files 13F is typed as both `tg:Fund` and `tg:Issuer`.
- `tg:subsidiaryOf` points from child to direct parent and is declared
  `owl:TransitiveProperty`; `tg:hasSubsidiary` is its inverse and
  `tg:hasParent` an equivalent name. The ETL materialises both directions of
  the direct edge so that stores without reasoning can traverse either way.
- `tg:Position` links a holder (`tg:heldBy` / `tg:holds`), an instrument
  (`tg:instrument`), a denormalised `tg:issuer`, `tg:quantity`, `tg:value`,
  `tg:asOf` and the `tg:Filing` it came from (`tg:filedIn`). `tg:Trade` is a
  subclass reserved for discrete transactions.
- `tg:Instrument` carries `tg:cusip`, `tg:instrumentClass` (COMMON, PREFERRED,
  DEBT, PUT, CALL), optional `tg:ticker` and `tg:issuedBy`.
- `tg:Filing` records accession number, form type, filer and period. Positions
  and subsidiary assertions both link to a filing, which is the provenance
  trail for every triple that matters.

Data lives in three named graphs (`.../graph/entities`, `.../graph/positions`,
`.../graph/ontology`). The ETL replaces a whole graph with one Graph Store
Protocol `PUT`, so a reload is idempotent and the ontology can be updated
without touching data.

## ETL mapping

`etl/src/tradegraph_etl` is split into sources, a transform and a loader.

- `sources/sample.py` reads the committed sample: 3,600 issuers from the SEC
  `company_tickers.json` snapshot, 58 listed managers with synthetic sub-funds,
  synthetic Exhibit 21 style subsidiaries for the first 420 issuers (two levels
  deep for half of them) and synthetic 13F-HR information tables. Finance and
  capital markets subsidiaries issue DEBT instruments, which is what makes the
  "through the issuer's subsidiaries" leg of exposure non-trivial.
- `sources/edgar.py` is the live path: `EdgarClient` enforces the SEC
  User-Agent and rate limit, reads `submissions/CIK*.json` to find the latest
  13F-HR, downloads the information table XML and resolves issuers by
  normalised name against the ticker list (EDGAR has no public CUSIP to CIK
  map).
- `transform.py` maps `Entity`, `Filing` and `Position` records to RDF with
  rdflib. IRIs are deterministic (`entity/{id}`, `instrument/{cusip}`,
  `position/{accession}/{index}`, `filing/{accession}`), so rebuilding the
  sample yields byte-identical N-Triples up to ordering. `validate()` refuses
  to emit a dataset with dangling parents, holders or issuers.
- `load.py` speaks the Graph Store Protocol. `StoreEndpoints.for_store`
  captures the only difference between the two stores: Fuseki exposes
  `/{ds}/data` and `/{ds}/sparql`, Stardog `/{db}` and `/{db}/query`.

## Query design

All SPARQL lives in `api/src/main/resources/queries/*.rq` as templates with
`${name}` placeholders. `QueryTemplates` refuses to render a template with an
unresolved placeholder, and every value that reaches a template is produced by
`SparqlValues` (identifiers validated against `[A-Za-z0-9_-]{1,64}`, string
literals escaped per the SPARQL grammar) or `SparqlPaths`. The API therefore
never concatenates raw user input into a query.

### Depth limited property paths

SPARQL 1.1 has no bounded repetition, and the extensions Jena and Stardog
offer differ. `SparqlPaths.bounded("tg:subsidiaryOf", 1, 3)` expands to
`(tg:subsidiaryOf|tg:subsidiaryOf/tg:subsidiaryOf|tg:subsidiaryOf/tg:subsidiaryOf/tg:subsidiaryOf)`,
which every store evaluates identically. Depth is capped by configuration
(`tradegraph.lineage.max-depth`, `tradegraph.exposure.max-depth`).

### Cost guard and metrics

`QueryTemplates` runs `QueryGuard.rejectUnboundedPaths` over every template as
it loads it: a `*` or `+` property path walks the whole lineage closure, and a
template is the only thing that could carry one, so the invariant is established
once at startup and a failure names the template. The check is deliberately not
applied to rendered queries, where the pattern would also match inside a quoted
literal the caller supplied, and a search for `tg:x+` is an ordinary search
term rather than a defect. A requested depth above the configured maximum is a
422 rather than a silent clamp, and the two maxima are separate: `tradegraph.exposure.max-depth`
is 4 and `tradegraph.lineage.max-depth` is 5. `SparqlClient` times every query
and hands the result to `QueryMetrics`, which keeps a Micrometer timer tagged
with the template name and a ring buffer of the last 200 timings; both are
visible through `/actuator/metrics/tradegraph.sparql` and `/ops/overview`.

### Reasoning

`tg:subsidiaryOf` is an `owl:TransitiveProperty` and `tg:hasSubsidiary` its
inverse, so a store that reasons already holds every ancestor edge. With
`tradegraph.store.reasoning=true` the exposure and concentration clauses ask
for one hop instead of the bounded alternation, and the lineage queries add a
`FILTER NOT EXISTS` so the chain walk still sees only direct parents.
`deploy/fuseki/assembler-inference.ttl` and `tradegraph.rules` give Fuseki the
same two entailments through a Jena generic rule reasoner on a second read only
service at `/ds-inf`; `ReasoningParityIT` loads the fixture and asserts the
exposure total is the same either way.

### Lineage

`lineage_up.rq` returns the parent edges reachable from an entity within the
depth budget, `lineage_down.rq` the child edges. SPARQL cannot report the
position of a node on a path, so `LineageService` orders the edges into a
chain (ancestors nearest first) and a tree (descendants) in Java. Ancestor
chains are cached separately (`ancestors` cache) because the exposure service
reuses them for path explanations.

### Exposure

`exposure.rq` is a single aggregate query:

1. Find the fund's ultimate parent: `{ BIND(<fund> AS ?root) } UNION { <fund> P ?root }`
   followed by `FILTER NOT EXISTS { ?root tg:subsidiaryOf ?above }`.
2. Holders are the funds in that family: `?holder a tg:Fund . FILTER(?holder = ?root || EXISTS { ?holder P ?root })`.
   This is a FILTER rather than a `BIND` inside a UNION branch on purpose:
   SPARQL evaluates group patterns bottom-up, so a `BIND(?root AS ?holder)`
   in its own group would see `?root` unbound and match every holder.
3. Issuer entities are the issuer plus its subsidiaries within depth:
   `{ BIND(<issuer> AS ?issuerEntity) } UNION { ?issuerEntity P <issuer> }`.
4. Join positions, group by holder, issuer entity and instrument, sum value
   and quantity, order by value.

`includeAffiliates=false` collapses step 2 to `BIND(<fund> AS ?holder)`;
`includeSubsidiaries=false` collapses step 3 the same way.

For every result line `ExposureService.buildPath` assembles the explanation
`fund -(parent)*-> root -(subsidiary)*-> holder -(holds)-> issuerEntity -(parent)*-> issuer`
from cached ancestor chains, reports `pathLength` (hops) and renders a
sentence. Totals are partitioned into direct, via subsidiaries (held by the
fund itself on a subsidiary's instrument) and via affiliates (held by another
fund in the family).

### Concentration

`/exposure/concentration` answers with three bounded queries rather than one
unbounded one: `concentration_total.rq` returns the family's total and issuer
count in a single row, `concentration.rq` returns the ranked page the request
asked for (`HAVING` the share threshold, `ORDER BY DESC(?value)`, `LIMIT`), and
`concentration_matches.rq` counts the issuers above that threshold in a single
row. `ConcentrationService` then turns values into shares. Grouping without a
limit would put no bound on the answer: one family in the committed sample
holds 276 distinct issuers in a single reporting period.

### Explorer graph

`neighbors.rq` unions four subqueries (parent, subsidiaries, top holdings by
value, top holders by value) and the explorer merges expansions client side
(`mergeGraphs`), keeping the original centre.

## Browser demo

`web/` answers the same lineage and exposure questions with no API and no store,
over a committed slice of `etl/sample`. It exists so the system can be read
without Docker, and it is held to the same standard as the rest of the
repository rather than treated as a brochure.

- The slice. `web/scripts/extract-slice.ts` keeps every fund manager and
  sub-fund, the top 300 issuers by position value plus the issuers the demo
  names, their subsidiaries to five levels, and every position whose holder and
  issuer are both kept. It writes `src/data/slice.json` and
  `src/data/slice-manifest.json`, which records the counts, the periods and a
  sha256 of the slice. `npm run selfcheck` recomputes all three.
- Query parity. `src/graph/queries.ts` follows the Spring Boot services hop for
  hop, and `src/graph/sparql.ts` renders `queries/*.rq` with the same
  substitution and the same bounded path expansion `QueryTemplates` and
  `SparqlPaths` use. The slice embeds the six templates the property path lab
  shows, and the self check asserts each one is byte identical to the file the
  API renders, so the SPARQL on the page cannot drift from the SPARQL in this
  repository. CI regenerates the slice and fails on any diff.
- The two depth caps come from `application.yml`: lineage 5, exposure 4.
- Measured against quoted. Every figure on the page is computed in the browser
  except the exposure latency, which is read from
  `src/data/demo-summary.json`. `scripts/demo_queries.py` writes that file
  during `make demo` with the commit, host and timestamp of the run, and the
  self check asserts the page's dataset figures equal the ones the demo
  measured and that the demo's dollar totals reproduce in the browser. In
  browser timings are not comparable with the API's: the page times function
  calls over an in memory store, the README times HTTP to Fuseki.

## Caching

Spring's cache abstraction with Caffeine (`maximumSize=5000, expireAfterWrite=10m`)
fronts every service method. `spring.cache.cache-names` in `application.yml` is
the list: `search`, `entity`, `lineage`, `ancestors`, `exposure`,
`concentration`, `trades`, `neighbors`, `stats`, `periods`, `delta`. The demo
shows the effect: a repeated exposure answer is served from the cache, and the
two figures are printed side by side by `make demo`.
`ExposurePerformanceIT` runs with `spring.cache.type=none` so it measures the
store, not the cache.

## Store configuration

### Fuseki (tests, CI, demo)

`deploy/docker-compose.yml` runs `secoresearch/fuseki` with data write and
update enabled. The bundled dataset `ds` has `tdb:unionDefaultGraph true`, so
patterns without a `GRAPH` clause see every named graph. Integration tests
start the same image through Testcontainers and load either the small fixture
(`api/src/test/resources/fixture.ttl`) or the full sample from `etl/build`.

### Stardog (target)

`deploy/docker-compose.stardog.yml` mounts the license from `STARDOG_LICENSE`
into `stardog/stardog` and starts the API with `SPRING_PROFILES_ACTIVE=stardog`.
Stardog specifics, all in `application-stardog.yml`:

- query endpoint `http://host:5820/{db}/query`, basic auth credentials;
- Stardog queries the union of all named graphs by default
  (`query.all.graphs=true`), matching the Fuseki setup;
- `tradegraph.store.reasoning=true` adds `reasoning=true` to every request.
  With the ontology loaded into its own named graph, Stardog then treats
  `tg:subsidiaryOf` as transitive, `tg:hasSubsidiary` as its inverse and
  `tg:hasParent` as equivalent, so ad hoc queries can use any of the three.
  The API keeps using explicit paths and produces the same answers with
  reasoning off.

Loading is the same command with `--store stardog`:

```
uv run tradegraph-etl load --endpoint http://localhost:5820/tradegraph --store stardog \
    --user admin --password admin
```

The Stardog stack is provided as configuration; the test results and demo
numbers in this repository were produced against Fuseki.
