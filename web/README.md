# Browser demo

A static page that answers TradeGraph's lineage and exposure questions without the API,
the store or Docker. Vite, React 18, TypeScript, d3 7. Deployed as a plain static site.

```
npm install
npm run dev         # local dev server
npm run build       # type check and bundle into dist/
npm run selfcheck   # 82 assertions against the README numbers and the slice manifest
npm run slice       # regenerate src/data/slice.json from etl/sample (already committed)
```

## What is real and what is sliced

Real, unchanged from the repository:

- the ontology. `src/data/slice.json` carries all 150 triples of
  `ontology/tradegraph.ttl`, and the class diagram, the labels, the comments and the
  domain and range rows are read out of them.
- the query semantics. `src/graph/queries.ts` follows the Spring Boot services hop for
  hop, including the reporting period an answer covers (the latest on or before `asOf`),
  the ownership weighting, and the caps from `application.yml` (lineage 5, exposure 4): the ultimate parent is found the way `exposure.rq` finds it, holders are the funds
  in that family, issuing entities are the issuer plus its subsidiaries within the depth
  budget, lines are grouped by holder, issuing entity and instrument, totals are split
  into direct, via subsidiaries and via affiliates, and every line gets the same path and
  the same explanation sentence `ExposureService.buildPath` and `explain` produce.
- the SPARQL. The property path lab renders `queries/*.rq` with the same template
  substitution and the same bounded path expansion the API uses, and shows it beside the
  function in this page that answers it, read from `src/graph/queries.ts` at load.
- the entity identities. Issuer and fund manager names, tickers and CIKs come from the
  SEC `company_tickers.json` snapshot, through `etl/sample`.

Synthetic, exactly as in `etl/sample/README.md`: holdings, subsidiary lists, quantities,
values, CUSIPs and accession numbers. They are derived from a fixed seed. Do not treat
the values as market data.

Sliced. `scripts/extract-slice.ts` keeps every fund manager and sub-fund, the top 300
issuers by position value plus the issuers the README demo names, the subsidiaries of
those issuers to five levels, and every position whose holder and issuer are both kept:

| | slice | full sample |
|---|---:|---:|
| legal entities | 1,760 | 6,100 |
| positions | 7,894 | 24,336 |
| filings | 1,028 | 1,239 |
| lineage edges | 1,420 | 2,500 |
| triples | 104,541 | 323,170 |

Both reporting periods (2024-03-31 and 2024-06-30) are in the slice, and so are the
ownership fractions on the subsidiary edges, so the period selector and the ownership
weighting answer the way the API does.

`src/data/slice-manifest.json` records the counts, the periods and a sha256 of
`slice.json`; the self check recomputes all three.

## What the numbers mean

The store in this page materialises the same triples the Python ETL writes and counts
them, so "104,541 triples" is a count, not a label; the full sample figure was checked
against `rdflib` and matches at 323,170. The four exposure pairs the top-level README
prints reproduce to the dollar: $2,475,300,433, $1,980,265,856, $1,523,775,489, and
$4,792,566 through Nu Finance Corp. at three hops. The lineage answers and the 26 of 72
pairs with exposure reproduce too.

One caveat worth stating plainly. That demo block was captured before the sample gained a
prior quarter and ownership fractions, so its dataset counts (12,373 positions in 829
filings, 207,095 triples) describe the single quarter the sample held then. The exposure
answers are unaffected: an answer covers one reporting period, and the latest one is
unchanged.

Milliseconds do not carry over and are not meant to. The README times a Spring Boot API
talking to Fuseki over HTTP; this page times function calls over an in-memory store, so
its queries land under `performance.now()`'s 0.1 ms resolution. The hero shows the
README's median of 64 ms as a quoted figure, labelled as such.

## Layout

```
scripts/extract-slice.ts   one-shot extraction of the slice and the manifest
scripts/selfcheck.ts       the assertions run by npm run selfcheck
src/graph/store.ts         slice -> triples, with typed edges for the query hops
src/graph/queries.ts       lineage, exposure, concentration, periods, neighbours, search
src/graph/sparql.ts        query template rendering, mirroring QueryTemplates
src/graph/cache.ts         bounded cache with hit and miss counters
src/data/slice.json        the committed slice (573 KiB)
src/components/            hero, ontology map, explorer, exposure, path lab, full run
```
