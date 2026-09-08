# Contributing

## Layout

```
ontology/   tradegraph.ttl
etl/        uv project: src/tradegraph_etl, tests, sample, scripts/make_sample.py
api/        Maven project: src/main (config, sparql, service, web, health), src/test (unit + *IT)
explorer/   Angular workspace
deploy/     compose stacks, Dockerfiles, nginx.conf
scripts/    demo.sh, demo_queries.py, wait-for.sh
```

## Workflow

1. `make setup` once.
2. Change one component at a time and keep its checks green:
   - ETL: `cd etl && uv run ruff check . && uv run ruff format . && uv run pytest`
   - API: `cd api && mvn -B verify` (needs Docker for the Testcontainers suites;
     run `make etl-sample` first so `ExposurePerformanceIT` has data, otherwise it is skipped)
   - Explorer: `cd explorer && npm run lint && npm test && npm run build`
3. `make lint && make test` before opening a pull request. CI runs the same steps.
4. Commit messages follow Conventional Commits, one line: `feat: ...`, `fix: ...`, `test: ...`, `docs: ...`.

## Conventions

- Every SPARQL statement lives in `api/src/main/resources/queries` and is
  rendered through `QueryTemplates`. Values must come from `SparqlValues` or
  `SparqlPaths`; never concatenate request input into a query.
- New endpoints get a unit test for any query building logic and an
  integration test in `ApiIT` against the fixture in
  `api/src/test/resources/fixture.ttl`. Extend the fixture rather than mocking
  the store.
- The sample dataset is regenerated, not hand edited: change
  `etl/scripts/make_sample.py` and rerun it with the SEC ticker snapshot
  (see `etl/sample/README.md`). Keep the seed so the output stays
  deterministic, and keep it above 5,000 entities.
- Ontology changes go into `ontology/tradegraph.ttl` first, then the ETL
  mapping, then the queries. Add a test in `etl/tests/test_transform.py` for
  every new predicate.
- Checkstyle (`api/config/checkstyle.xml`), ruff and angular-eslint are the
  style authorities; do not disable rules inline.

## Local Docker notes

The Testcontainers suites use the Docker socket from `~/.testcontainers.properties`
or `DOCKER_HOST`. On Colima the Ryuk sidecar cannot bind mount the socket,
so the Makefile exports `TESTCONTAINERS_RYUK_DISABLED=true`; containers are
stopped by a JVM shutdown hook instead. `make demo` stops the Fuseki container
it started unless `KEEP_FUSEKI=1` is set.
