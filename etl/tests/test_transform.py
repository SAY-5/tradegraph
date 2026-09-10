from decimal import Decimal

from rdflib import RDF, Literal, URIRef
from rdflib.namespace import XSD

from tradegraph_etl import transform
from tradegraph_etl.transform import (
    GRAPH_ENTITIES,
    GRAPH_ONTOLOGY,
    GRAPH_POSITIONS,
    TG,
    entity_iri,
    instrument_iri,
    position_iri,
    to_rdf,
)


def test_entity_mapping_types_and_identifiers(tiny_dataset):
    g = to_rdf(tiny_dataset).graph(GRAPH_ENTITIES)
    acme = entity_iri("0000000001")
    assert (acme, RDF.type, TG.Issuer) in g
    assert (acme, RDF.type, TG.Counterparty) in g
    assert (acme, RDF.type, TG.LegalEntity) in g
    assert (acme, TG.cik, Literal("0000000001", datatype=XSD.string)) in g
    assert (acme, TG.ticker, Literal("ACME", datatype=XSD.string)) in g
    sub = entity_iri("S00000101")
    assert (sub, RDF.type, TG.Subsidiary) in g
    assert (sub, RDF.type, TG.Counterparty) not in g
    assert (sub, TG.jurisdiction, Literal("DE", datatype=XSD.string)) in g


def test_lineage_triples_both_directions(tiny_dataset):
    g = to_rdf(tiny_dataset).graph(GRAPH_ENTITIES)
    assert (entity_iri("S00000101"), TG.subsidiaryOf, entity_iri("0000000001")) in g
    assert (entity_iri("0000000001"), TG.hasSubsidiary, entity_iri("S00000101")) in g
    assert (entity_iri("S0000010101"), TG.subsidiaryOf, entity_iri("S00000101")) in g
    assert (entity_iri("F00000201"), TG.subsidiaryOf, entity_iri("0000000002")) in g
    # provenance of the subsidiary assertion
    filing = URIRef("https://tradegraph.dev/filing/0000000001-24-000001")
    assert (entity_iri("S00000101"), TG.filedIn, filing) in g


def test_position_mapping(tiny_dataset):
    g = to_rdf(tiny_dataset).graph(GRAPH_POSITIONS)
    pos = position_iri("0000000002-24-000002", 0)
    assert (pos, RDF.type, TG.Position) in g
    assert (entity_iri("F00000201"), TG.holds, pos) in g
    assert (pos, TG.heldBy, entity_iri("F00000201")) in g
    assert (pos, TG.issuer, entity_iri("S00000101")) in g
    assert (pos, TG.value, Literal(Decimal("49000.5"), datatype=XSD.decimal)) in g
    assert (pos, TG.quantity, Literal(Decimal("50000"), datatype=XSD.decimal)) in g
    assert (pos, TG.asOf, Literal("2024-06-30", datatype=XSD.date)) in g
    inst = instrument_iri("900000002")
    assert (pos, TG.instrument, inst) in g
    assert (inst, TG.instrumentClass, Literal("DEBT", datatype=XSD.string)) in g
    assert (inst, TG.issuedBy, entity_iri("S00000101")) in g
    assert (entity_iri("F00000201"), TG.counterpartyOf, entity_iri("S00000101")) in g


def test_filing_mapping(tiny_dataset):
    g = to_rdf(tiny_dataset).graph(GRAPH_POSITIONS)
    f = URIRef("https://tradegraph.dev/filing/0000000002-24-000001")
    assert (f, RDF.type, TG.Filing) in g
    assert (f, TG.formType, Literal("13F-HR", datatype=XSD.string)) in g
    assert (f, TG.filedBy, entity_iri("0000000002")) in g
    assert (f, TG.periodOfReport, Literal("2024-06-30", datatype=XSD.date)) in g


def test_ownership_fraction_defaults_to_whole_and_says_so(tiny_dataset):
    g = to_rdf(tiny_dataset).graph(GRAPH_ENTITIES)
    stated = entity_iri("S00000101")
    assert (stated, TG.ownershipFraction, Literal(Decimal("0.8"), datatype=XSD.decimal)) in g
    assert (stated, TG.ownershipAssumed, Literal(False)) in g
    unstated = entity_iri("S0000010101")
    assert (unstated, TG.ownershipFraction, Literal(Decimal("1.0"), datatype=XSD.decimal)) in g
    assert (unstated, TG.ownershipAssumed, Literal(True)) in g
    assert list(g.objects(entity_iri("0000000001"), TG.ownershipFraction)) == []


def test_ontology_graph_is_loaded(tiny_dataset, ontology_ttl):
    store = to_rdf(tiny_dataset, ontology_ttl)
    onto = store.graph(GRAPH_ONTOLOGY)
    assert len(onto) > 100
    transitive = URIRef("http://www.w3.org/2002/07/owl#TransitiveProperty")
    assert (TG.subsidiaryOf, RDF.type, transitive) in onto


def test_validate_reports_dangling_references(tiny_dataset):
    assert transform.validate(tiny_dataset) == []
    tiny_dataset.positions[0] = tiny_dataset.positions[0].__class__(
        **{**tiny_dataset.positions[0].__dict__, "issuer": "missing"}
    )
    assert transform.validate(tiny_dataset) == [
        "position 0000000002-24-000001/0 has unknown issuer missing"
    ]


def test_lineage_depths(tiny_dataset):
    depths = transform.lineage_depths(tiny_dataset)
    assert depths["0000000001"] == 0
    assert depths["S00000101"] == 1
    assert depths["S0000010101"] == 2
    assert depths["F00000201"] == 1


def test_transform_is_deterministic(tiny_dataset):
    a = to_rdf(tiny_dataset).graph(GRAPH_POSITIONS).serialize(format="nt")
    b = to_rdf(tiny_dataset).graph(GRAPH_POSITIONS).serialize(format="nt")
    assert sorted(a.splitlines()) == sorted(b.splitlines())
