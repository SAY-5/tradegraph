from dataclasses import replace
from pathlib import Path

from rdflib import Literal

from tradegraph_etl import quality, transform
from tradegraph_etl.model import Entity
from tradegraph_etl.transform import GRAPH_POSITIONS, TG, instrument_iri, to_rdf

SHAPES = (Path(__file__).resolve().parents[2] / "ontology" / "shapes.ttl").read_text()


def test_clean_dataset_reports_nothing(tiny_dataset):
    report = quality.report(tiny_dataset)
    assert report.conforms
    assert report.to_json()["findings"] == []
    assert report.to_json()["entities"] == 5


def test_injected_cycle_is_reported(tiny_dataset):
    parent = next(e for e in tiny_dataset.entities if e.id == "0000000001")
    tiny_dataset.entities[tiny_dataset.entities.index(parent)] = replace(
        parent, parent="S0000010101"
    )

    report = quality.report(tiny_dataset)

    assert not report.conforms
    assert report.subsidiary_cycles == [
        "subsidiaryOf cycle: 0000000001 -> S0000010101 -> S00000101 -> 0000000001"
    ]
    assert report.to_json()["subsidiaryCycles"] == 1
    # the depth walk must still terminate on cyclic data
    assert max(transform.lineage_depths(tiny_dataset).values()) <= len(tiny_dataset.entities)


def test_dangling_reference_is_reported(tiny_dataset):
    position = tiny_dataset.positions[0]
    tiny_dataset.positions[0] = replace(position, issuer="0000009999")

    report = quality.report(tiny_dataset)

    assert not report.conforms
    assert report.dangling_references == [
        "position 0000000002-24-000001/0 has unknown issuer 0000009999"
    ]
    assert report.to_json()["danglingReferences"] == 1


def test_issuer_without_identifiers_is_reported(tiny_dataset):
    tiny_dataset.entities.append(Entity(id="0000009998", name="Nameless Corp", kind="ISSUER"))

    report = quality.report(tiny_dataset)

    assert report.missing_identifiers == ["issuer 0000009998 has neither a CIK nor a ticker"]


def test_shapes_accept_the_transformed_dataset(tiny_dataset):
    report = quality.report(tiny_dataset, to_rdf(tiny_dataset), SHAPES)
    assert report.shacl_violations == []
    assert report.conforms


def test_shapes_reject_an_instrument_class_outside_the_vocabulary(tiny_dataset):
    store = to_rdf(tiny_dataset)
    positions = store.graph(GRAPH_POSITIONS)
    instrument = instrument_iri("900000002")
    positions.remove((instrument, TG.instrumentClass, None))
    positions.add((instrument, TG.instrumentClass, Literal("SWAP")))

    report = quality.report(tiny_dataset, store, SHAPES)

    assert not report.conforms
    assert any("instrumentClass" in v for v in report.shacl_violations)
