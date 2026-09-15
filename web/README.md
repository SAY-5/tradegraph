# Browser demo

A static page that answers TradeGraph's lineage and exposure questions without the API,
the store or Docker. Vite, React 18, TypeScript, d3-force. Deployed as a plain static site.

```
npm install
npm run dev         # local dev server
npm run build       # type check and bundle into dist/
npm run selfcheck   # the assertions the script lists, against the demo summary and the manifest
npm run weight      # measures dist/ and fails if the payload grows past the ceiling
npm run slice       # regenerate src/data/slice.json from etl/sample (already committed)
```

`make web` from the repository root runs the same checks CI runs, and adds a drift gate:
it regenerates the slice and fails if the committed copy differs.

## What is real and what is sliced

Real, unchanged from the repository:

- the ontology. `src/data/slice.json` carries all 150 triples of
  `ontology/tradegraph.ttl`, and the class diagram, the labels, the comments and the
  domain and range rows are read out of them. The count is not a claim in prose:
  `etl/tests/test_manifest_parity.py` asserts that rdflib reads the same number out of
  the Turtle file that the manifest records.
- the query semantics. `src/graph/queries.ts` follows the Spring Boot services hop for
  hop, including the reporting period an answer covers (the latest on or before `asOf`),
  the ownership weighting, and the caps from `application.yml` (lineage 5, exposure 4):
  the ultimate parent is found the way `exposure.rq` finds it, holders are the funds
  in that family, issuing entities are the issuer plus its subsidiaries within the depth
  budget, lines are grouped by holder, issuing entity and instrument, totals are split
  into direct, via subsidiaries and via affiliates, and every line gets the same path and
  the same explanation sentence `ExposureService.buildPath` and `explain` produce.
- the SPARQL. The property path lab renders the six `queries/*.rq` templates it shows
  with the same template substitution and the same bounded path expansion the API uses,
  and shows each beside the function in this page that answers it, read from
  `src/graph/queries.ts` at load. The self check asserts every embedded template is byte
  identical to the file the API renders, and CI fails if a template changes without the
  slice being regenerated.
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
| filings | 1,028 | 1,240 |
| lineage edges | 1,420 | 2,500 |
| triples | 104,541 | 323,173 |

Both reporting periods (2024-03-31 and 2024-06-30) are in the slice, and so are the
ownership fractions on the subsidiary edges, so the period selector and the ownership
weighting answer the way the API does.

`src/data/slice-manifest.json` records the counts, the periods and a sha256 of
`slice.json`; the self check recomputes all three.

## What the numbers mean

The store in this page materialises the same triples the Python ETL writes and counts
them, so "104,541 triples" is a count, not a label. The full sample figure is asserted
against the count rdflib produces, in `etl/tests/test_manifest_parity.py`, so the page
and the ETL cannot drift apart at 323,173.

The four exposure pairs the top-level README prints reproduce to the dollar:
$2,475,300,433, $1,980,265,856, $1,523,775,489, and $4,792,566 through Nu Finance Corp.
at three hops. The lineage answers and the 26 of 72 pairs with exposure reproduce too.
None of those figures is transcribed: `scripts/demo_queries.py` writes
`src/data/demo-summary.json` during `make demo`, and the self check asserts that the
dataset counts in the manifest equal the ones that run measured and that each of its
dollar totals reproduces in the browser.

Milliseconds do not carry over and are not meant to. The README times a Spring Boot API
talking to Fuseki over HTTP; this page times function calls over an in-memory store, so
its queries land under `performance.now()`'s 0.1 ms resolution. The hero's latency
counter is therefore the one figure on the page that the page did not compute: it is read
from `demo-summary.json`, and the note under the counters names the store, the commit,
the host and the timestamp of the run that produced it.

## Payload

Measured by `npm run weight` on the committed slice: 843,747 B on disk and 240,875 B
gzipped, which is 824 KiB and 235 KiB, across one JS bundle, one stylesheet and
`index.html`. Most of it is the slice, 572 KiB of JSON embedded in the bundle. The script
fails above 1,100,000 B on disk or 300,000 B gzipped, so a payload that doubles is a
failed check rather than a slower page.

Runtime dependencies are `react`, `react-dom` and `d3-force`. The page makes one
third-party request, for the two IBM Plex faces from Google Fonts; both have a real
system fallback stack, so the page reads correctly before or without them.

## Accessibility

A skip link, landmark elements, a visible focus ring and a reduced-motion preference
threaded through every animated component. The two interactive diagrams are
`role="group"` rather than `role="img"`, because their boxes and nodes are focusable
buttons that a graphics role would hide; Enter and Space both activate one, and Space
does not also scroll the page. The neighbourhood graph is duplicated as a list of
buttons in the reading order of `neighbors.rq`, so expanding a neighbour never depends on
focusing an SVG circle. The count-up animation is hidden from assistive technology while
it runs and the settled number is announced once. `--dim`, the dimmest text token,
measures 6.25:1 on the page background and 5.82:1 on a panel.

## Layout

```
scripts/extract-slice.ts   one-shot extraction of the slice and the manifest
scripts/selfcheck.ts       the assertions run by npm run selfcheck
scripts/weight.ts          the payload measurement run by npm run weight
src/graph/store.ts         slice -> triples, with typed edges for the query hops
src/graph/queries.ts       lineage, exposure, concentration, periods, neighbours, search
src/graph/sparql.ts        query template rendering, mirroring QueryTemplates
src/graph/cache.ts         bounded cache with hit and miss counters
src/data/slice.json        the committed slice (572 KiB)
src/data/demo-summary.json what `make demo` measured, with its commit and host
src/components/            hero, ontology map, explorer, exposure, path lab, full run
src/components/ErrorBoundary.tsx  one failing section degrades instead of blanking the page
```
