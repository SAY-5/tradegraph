from collections import Counter

from rdflib import RDF

from tradegraph_etl import transform
from tradegraph_etl.transform import GRAPH_ENTITIES, TG, to_rdf


def test_sample_has_at_least_5000_entities(sample_dataset):
    counts = sample_dataset.counts()
    assert counts["entities"] >= 5000
    listed_managers = [e for e in sample_dataset.entities if "ISSUER" in e.extra_kinds]
    assert len(listed_managers) == 58
    assert counts["issuers"] >= 3000
    assert counts["funds"] >= 200
    assert counts["subsidiaries"] >= 1000
    assert counts["positions"] >= 5000


def test_sample_ids_are_unique_and_references_resolve(sample_dataset):
    ids = [e.id for e in sample_dataset.entities]
    assert len(ids) == len(set(ids))
    assert transform.validate(sample_dataset) == []


def test_sample_lineage_has_two_levels(sample_dataset):
    depths = transform.lineage_depths(sample_dataset)
    assert max(depths.values()) == 2
    assert sum(1 for d in depths.values() if d == 2) > 100


def test_sample_positions_cover_subsidiaries(sample_dataset):
    subsidiaries = {e.id for e in sample_dataset.entities if e.kind == "SUBSIDIARY"}
    on_subs = [p for p in sample_dataset.positions if p.issuer in subsidiaries]
    assert len(on_subs) > 500
    assert {p.instrument_class for p in on_subs} == {"DEBT"}


def test_sample_rdf_entity_count(sample_dataset):
    g = to_rdf(sample_dataset).graph(GRAPH_ENTITIES)
    entities = set(g.subjects(RDF.type, TG.LegalEntity))
    assert len(entities) == sample_dataset.counts()["entities"] >= 5000


def test_sample_positions_span_two_reporting_periods(sample_dataset):
    periods = sample_dataset.periods()
    assert periods == ["2024-03-31", "2024-06-30"]
    by_period = Counter(p.as_of for p in sample_dataset.positions)
    assert by_period["2024-06-30"] > by_period["2024-03-31"] > 5000
    thirteen_f = {f.period for f in sample_dataset.filings if f.form_type == "13F-HR"}
    assert thirteen_f == set(periods)


def test_sample_subsidiaries_carry_stated_and_unstated_ownership(sample_dataset):
    subsidiaries = [e for e in sample_dataset.entities if e.kind == "SUBSIDIARY"]
    stated = [e for e in subsidiaries if e.ownership is not None]
    assert len(stated) > 1000
    assert len(subsidiaries) - len(stated) > 100
    assert {e.ownership for e in stated} == {0.51, 0.6, 0.75, 0.8, 0.9, 1.0}
