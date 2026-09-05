"""Load named graphs through the SPARQL 1.1 Graph Store Protocol.

The same code path works for Stardog and Fuseki; only the URL shape differs:

    Fuseki  http://host:3030/{dataset}/data?graph=IRI      (GSP)
            http://host:3030/{dataset}/sparql               (SPARQL)
    Stardog http://host:5820/{db}?graph=IRI                 (GSP)
            http://host:5820/{db}/query                     (SPARQL)
"""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlencode

import httpx
from rdflib import Dataset as RdfDataset
from rdflib import URIRef
from rdflib.graph import DATASET_DEFAULT_GRAPH_ID


@dataclass(frozen=True)
class StoreEndpoints:
    graph_store: str
    query: str

    @classmethod
    def for_store(cls, base: str, store: str) -> StoreEndpoints:
        base = base.rstrip("/")
        if store == "fuseki":
            return cls(graph_store=f"{base}/data", query=f"{base}/sparql")
        if store == "stardog":
            return cls(graph_store=base, query=f"{base}/query")
        raise ValueError(f"unknown store {store!r}")


class GraphStoreLoader:
    """PUT replaces a named graph, which makes repeated loads idempotent."""

    def __init__(
        self,
        endpoints: StoreEndpoints,
        auth: tuple[str, str] | None = None,
        timeout: float = 300.0,
        client: httpx.Client | None = None,
    ) -> None:
        self.endpoints = endpoints
        self.client = client or httpx.Client(auth=auth, timeout=timeout)

    def put_graph(self, graph_iri: URIRef, ntriples: bytes) -> int:
        url = f"{self.endpoints.graph_store}?{urlencode({'graph': str(graph_iri)})}"
        resp = self.client.put(
            url, content=ntriples, headers={"Content-Type": "application/n-triples"}
        )
        resp.raise_for_status()
        return resp.status_code

    def load(self, store: RdfDataset) -> dict[str, int]:
        loaded: dict[str, int] = {}
        for g in store.graphs():
            if g.identifier == DATASET_DEFAULT_GRAPH_ID or len(g) == 0:
                continue
            data = g.serialize(format="nt", encoding="utf-8")
            self.put_graph(URIRef(g.identifier), data)
            loaded[str(g.identifier)] = len(g)
        return loaded

    def count_triples(self) -> int:
        return self._count("SELECT (COUNT(*) AS ?n) WHERE { GRAPH ?g { ?s ?p ?o } }")

    def count_entities(self) -> int:
        return self._count(
            "PREFIX tg: <https://tradegraph.dev/ontology#> "
            "SELECT (COUNT(DISTINCT ?e) AS ?n) WHERE { GRAPH ?g { ?e a tg:LegalEntity } }"
        )

    def _count(self, query: str) -> int:
        resp = self.client.post(
            self.endpoints.query,
            data={"query": query},
            headers={"Accept": "application/sparql-results+json"},
        )
        resp.raise_for_status()
        bindings = resp.json()["results"]["bindings"]
        return int(bindings[0]["n"]["value"]) if bindings else 0
