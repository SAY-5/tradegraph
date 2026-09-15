"""The browser demo's manifest counts against the counts rdflib produces here.

``web/scripts/extract-slice.ts`` materialises the triples the ETL would write and
counts them in TypeScript. These assertions keep that count and the ontology size
honest: if either side drifts, the suite fails instead of the page quoting a figure
the data no longer supports.
"""

from __future__ import annotations

import json
from pathlib import Path

from rdflib import Graph

from tradegraph_etl import transform

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = json.loads((ROOT / "web" / "src" / "data" / "slice-manifest.json").read_text())


def test_ontology_triple_count_matches_the_manifest():
    graph = Graph()
    graph.parse(ROOT / "ontology" / "tradegraph.ttl", format="turtle")
    assert len(graph) == MANIFEST["counts"]["ontologyTriples"]


def test_full_sample_triple_count_matches_the_manifest(sample_dataset, ontology_ttl):
    store = transform.to_rdf(sample_dataset, ontology_ttl)
    triples = sum(transform.graph_sizes(store).values())
    assert triples == MANIFEST["full"]["triples"]


def test_full_sample_entity_and_position_counts_match_the_manifest(sample_dataset):
    counts = sample_dataset.counts()
    full = MANIFEST["full"]
    assert counts["entities"] == full["entities"]
    assert counts["issuers"] == full["issuers"]
    assert counts["funds"] == full["funds"]
    assert counts["subsidiaries"] == full["subsidiaries"]
    assert counts["positions"] == full["positions"]
    assert counts["filings"] == full["filings"]
    assert sample_dataset.periods() == sorted(full["periods"])
