"""Idempotent loading against a minimal in-process Graph Store Protocol server."""

import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

import pytest
from rdflib import Dataset as RdfDataset
from rdflib import Graph

from tradegraph_etl.load import GraphStoreLoader, StoreEndpoints
from tradegraph_etl.transform import GRAPH_ENTITIES, GRAPH_POSITIONS, to_rdf


class FakeStore:
    def __init__(self):
        self.graphs: dict[str, Graph] = {}
        self.puts = 0

    def triples(self) -> int:
        return sum(len(g) for g in self.graphs.values())


def make_handler(store: FakeStore):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_PUT(self):
            url = urlparse(self.path)
            graph_iri = parse_qs(url.query)["graph"][0]
            body = self.rfile.read(int(self.headers["Content-Length"]))
            g = Graph()
            g.parse(data=body, format="nt")
            existed = graph_iri in store.graphs
            store.graphs[graph_iri] = g
            store.puts += 1
            self.send_response(204 if existed else 201)
            self.end_headers()

        def do_POST(self):
            body = self.rfile.read(int(self.headers["Content-Length"])).decode()
            query = parse_qs(body)["query"][0]
            n = (
                store.triples()
                if "COUNT(*)" in query
                else len({s for g in store.graphs.values() for s in g.subjects()})
            )
            payload = (
                '{"head":{"vars":["n"]},"results":{"bindings":[{"n":{"value":"' + str(n) + '"}}]}}'
            ).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/sparql-results+json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    return Handler


@pytest.fixture
def fake_server():
    store = FakeStore()
    server = HTTPServer(("127.0.0.1", 0), make_handler(store))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield store, f"http://127.0.0.1:{server.server_port}/tradegraph"
    server.shutdown()


def test_store_endpoints_shapes():
    f = StoreEndpoints.for_store("http://h:3030/ds/", "fuseki")
    assert (f.graph_store, f.query) == ("http://h:3030/ds/data", "http://h:3030/ds/query")
    s = StoreEndpoints.for_store("http://h:5820/db", "stardog")
    assert (s.graph_store, s.query) == ("http://h:5820/db", "http://h:5820/db/query")
    with pytest.raises(ValueError):
        StoreEndpoints.for_store("http://h", "neo4j")


def test_load_twice_is_idempotent(fake_server, tiny_dataset):
    store, base = fake_server
    loader = GraphStoreLoader(StoreEndpoints.for_store(base, "fuseki"))
    rdf = to_rdf(tiny_dataset)

    first = loader.load(rdf)
    triples_after_first = store.triples()
    second = loader.load(rdf)

    assert first == second
    assert set(first) == {str(GRAPH_ENTITIES), str(GRAPH_POSITIONS)}
    assert (
        store.triples()
        == triples_after_first
        == len(rdf.graph(GRAPH_ENTITIES)) + len(rdf.graph(GRAPH_POSITIONS))
    )
    assert store.puts == 4
    assert loader.count_triples() == triples_after_first


def test_load_skips_empty_graphs(fake_server):
    store, base = fake_server
    loader = GraphStoreLoader(StoreEndpoints.for_store(base, "fuseki"))
    assert loader.load(RdfDataset()) == {}
    assert store.puts == 0
