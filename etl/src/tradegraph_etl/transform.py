"""Map ``Dataset`` records to RDF according to ``ontology/tradegraph.ttl``."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from rdflib import RDF, Graph, Literal, Namespace, URIRef
from rdflib import Dataset as RdfDataset
from rdflib.graph import DATASET_DEFAULT_GRAPH_ID
from rdflib.namespace import XSD

from tradegraph_etl.model import Dataset, Entity, Filing, Position

TG = Namespace("https://tradegraph.dev/ontology#")
ENTITY = Namespace("https://tradegraph.dev/entity/")
INSTRUMENT = Namespace("https://tradegraph.dev/instrument/")
POSITION = Namespace("https://tradegraph.dev/position/")
FILING = Namespace("https://tradegraph.dev/filing/")

GRAPH_ENTITIES = URIRef("https://tradegraph.dev/graph/entities")
GRAPH_POSITIONS = URIRef("https://tradegraph.dev/graph/positions")
GRAPH_ONTOLOGY = URIRef("https://tradegraph.dev/graph/ontology")

KIND_CLASS = {"ISSUER": TG.Issuer, "FUND": TG.Fund, "SUBSIDIARY": TG.Subsidiary}


def entity_iri(entity_id: str) -> URIRef:
    return ENTITY[entity_id]


def instrument_iri(cusip: str) -> URIRef:
    return INSTRUMENT[cusip]


def position_iri(accession: str, index: int) -> URIRef:
    return POSITION[f"{accession}/{index}"]


def filing_iri(accession: str) -> URIRef:
    return FILING[accession]


def _string(value: str) -> Literal:
    return Literal(value, datatype=XSD.string)


def _decimal(value: float) -> Literal:
    return Literal(Decimal(str(value)), datatype=XSD.decimal)


def add_entity(g: Graph, e: Entity) -> None:
    s = entity_iri(e.id)
    g.add((s, RDF.type, TG.LegalEntity))
    for kind in (e.kind, *e.extra_kinds):
        g.add((s, RDF.type, KIND_CLASS[kind]))
        if kind in ("ISSUER", "FUND"):
            g.add((s, RDF.type, TG.Counterparty))
    g.add((s, TG.name, _string(e.name)))
    if e.cik:
        g.add((s, TG.cik, _string(e.cik)))
    if e.ticker:
        g.add((s, TG.ticker, _string(e.ticker)))
    if e.lei:
        g.add((s, TG.lei, _string(e.lei)))
    if e.jurisdiction:
        g.add((s, TG.jurisdiction, _string(e.jurisdiction)))
    if e.sic:
        g.add((s, TG.sic, _string(e.sic)))
    if e.parent:
        g.add((s, TG.subsidiaryOf, entity_iri(e.parent)))
        g.add((entity_iri(e.parent), TG.hasSubsidiary, s))
    if e.filing:
        g.add((s, TG.filedIn, filing_iri(e.filing)))


def add_filing(g: Graph, f: Filing) -> None:
    s = filing_iri(f.accession)
    g.add((s, RDF.type, TG.Filing))
    g.add((s, TG.accessionNumber, _string(f.accession)))
    g.add((s, TG.formType, _string(f.form_type)))
    g.add((s, TG.filedBy, entity_iri(f.filer)))
    g.add((s, TG.periodOfReport, Literal(f.period, datatype=XSD.date)))


def add_position(g: Graph, p: Position) -> None:
    s = position_iri(p.filing, p.index)
    holder = entity_iri(p.holder)
    issuer = entity_iri(p.issuer)
    inst = instrument_iri(p.cusip)
    g.add((s, RDF.type, TG.Position))
    g.add((holder, TG.holds, s))
    g.add((s, TG.heldBy, holder))
    g.add((s, TG.issuer, issuer))
    g.add((s, TG.instrument, inst))
    g.add((s, TG.quantity, _decimal(p.quantity)))
    g.add((s, TG.value, _decimal(p.value)))
    g.add((s, TG.asOf, Literal(p.as_of, datatype=XSD.date)))
    g.add((s, TG.filedIn, filing_iri(p.filing)))
    g.add((inst, RDF.type, TG.Instrument))
    g.add((inst, TG.cusip, _string(p.cusip)))
    g.add((inst, TG.instrumentClass, _string(p.instrument_class)))
    g.add((inst, TG.issuedBy, issuer))
    g.add((inst, TG.name, _string(f"{p.issuer_name} {p.instrument_class}")))
    if p.ticker:
        g.add((inst, TG.ticker, _string(p.ticker)))
    g.add((holder, TG.counterpartyOf, issuer))
    g.add((issuer, TG.counterpartyOf, holder))


def to_rdf(ds: Dataset, ontology_ttl: str | None = None) -> RdfDataset:
    """Return an rdflib Dataset with the three named graphs populated."""
    store = RdfDataset()
    for prefix, ns in (("tg", TG), ("entity", ENTITY), ("instrument", INSTRUMENT)):
        store.bind(prefix, ns)
    entities = store.graph(GRAPH_ENTITIES)
    positions = store.graph(GRAPH_POSITIONS)
    for e in ds.entities:
        add_entity(entities, e)
    for f in ds.filings:
        add_filing(positions, f)
    for p in ds.positions:
        add_position(positions, p)
    if ontology_ttl:
        store.graph(GRAPH_ONTOLOGY).parse(data=ontology_ttl, format="turtle")
    return store


def validate(ds: Dataset) -> list[str]:
    """Return human readable problems: dangling parents, holders or issuers."""
    ids = {e.id for e in ds.entities}
    problems: list[str] = []
    for e in ds.entities:
        if e.parent and e.parent not in ids:
            problems.append(f"entity {e.id} has unknown parent {e.parent}")
    for p in ds.positions:
        if p.holder not in ids:
            problems.append(f"position {p.filing}/{p.index} has unknown holder {p.holder}")
        if p.issuer not in ids:
            problems.append(f"position {p.filing}/{p.index} has unknown issuer {p.issuer}")
    return problems


def lineage_depths(ds: Dataset) -> dict[str, int]:
    """Depth of each entity below its ultimate parent (0 for roots)."""
    parent = {e.id: e.parent for e in ds.entities}
    depths: dict[str, int] = {}
    for eid in parent:
        d, cur = 0, eid
        while parent.get(cur):
            cur = parent[cur]
            d += 1
        depths[eid] = d
    return depths


def graph_sizes(store: RdfDataset) -> dict[str, int]:
    sizes: defaultdict[str, int] = defaultdict(int)
    for g in store.graphs():
        if g.identifier != DATASET_DEFAULT_GRAPH_ID:
            sizes[str(g.identifier)] = len(g)
    return dict(sizes)
