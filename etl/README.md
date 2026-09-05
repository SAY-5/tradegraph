# tradegraph-etl

Builds the TradeGraph RDF dataset from SEC EDGAR data and loads it into a
SPARQL 1.1 store (Stardog or Apache Jena Fuseki) through the Graph Store
Protocol.

```
uv sync
uv run tradegraph-etl build --sample                 # writes build/*.nt
uv run tradegraph-etl build --live --funds 25        # pulls from data.sec.gov
uv run tradegraph-etl load --endpoint http://localhost:3030/ds
uv run tradegraph-etl stats --endpoint http://localhost:3030/ds
uv run pytest
```

See `sample/README.md` for what the committed sample contains and how it was
produced.
