"""Data quality checks over a built dataset.

Two kinds of problem are reported. SHACL says what a well formed graph looks
like, so ``ontology/shapes.ttl`` is run over the RDF with pyshacl. Dangling
references, ``subsidiaryOf`` cycles and missing identifiers are properties of
the dataset as a whole rather than of one node, so they are found here and
reported alongside the SHACL result in one JSON document that the API serves.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from rdflib import Dataset as RdfDataset
from rdflib import Graph

from tradegraph_etl.model import Dataset
from tradegraph_etl.transform import validate

MAX_FINDINGS = 50


@dataclass
class QualityReport:
    checked_at: str
    entities: int
    positions: int
    dangling_references: list[str] = field(default_factory=list)
    subsidiary_cycles: list[str] = field(default_factory=list)
    missing_identifiers: list[str] = field(default_factory=list)
    shacl_violations: list[str] = field(default_factory=list)

    @property
    def conforms(self) -> bool:
        return not (
            self.dangling_references
            or self.subsidiary_cycles
            or self.missing_identifiers
            or self.shacl_violations
        )

    def findings(self) -> list[str]:
        return (
            self.dangling_references
            + self.subsidiary_cycles
            + self.missing_identifiers
            + self.shacl_violations
        )[:MAX_FINDINGS]

    def to_json(self) -> dict:
        return {
            "checkedAt": self.checked_at,
            "conforms": self.conforms,
            "entities": self.entities,
            "positions": self.positions,
            "danglingReferences": len(self.dangling_references),
            "subsidiaryCycles": len(self.subsidiary_cycles),
            "missingIdentifiers": len(self.missing_identifiers),
            "shaclViolations": len(self.shacl_violations),
            "findings": self.findings(),
        }


def subsidiary_cycles(ds: Dataset) -> list[str]:
    """Every ``subsidiaryOf`` cycle, reported once as ``a -> b -> a``."""
    parent = {e.id: e.parent for e in ds.entities}
    seen: set[str] = set()
    cycles: list[str] = []
    for start in parent:
        if start in seen:
            continue
        path: list[str] = []
        index: dict[str, int] = {}
        cursor: str | None = start
        while cursor is not None and cursor not in seen and cursor in parent:
            if cursor in index:
                loop = path[index[cursor] :]
                cycles.append("subsidiaryOf cycle: " + " -> ".join([*loop, cursor]))
                break
            index[cursor] = len(path)
            path.append(cursor)
            cursor = parent[cursor]
        seen.update(path)
    return cycles


def missing_identifiers(ds: Dataset) -> list[str]:
    """Entities with no name, and issuers that carry neither a CIK nor a ticker."""
    problems: list[str] = []
    for e in ds.entities:
        if not e.name or not e.name.strip():
            problems.append(f"entity {e.id} has no name")
        if "ISSUER" in (e.kind, *e.extra_kinds) and not e.cik and not e.ticker:
            problems.append(f"issuer {e.id} has neither a CIK nor a ticker")
    return problems


def shacl_violations(data: Graph, shapes_ttl: str) -> list[str]:
    """Run the shapes over a graph and return one line per violation."""
    from pyshacl import validate as shacl_validate

    shapes = Graph().parse(data=shapes_ttl, format="turtle")
    conforms, results, _ = shacl_validate(
        data, shacl_graph=shapes, advanced=False, inference="none"
    )
    if conforms:
        return []
    return [
        f"shape violation: {focus} {path or ''}".strip() for focus, path in _violations(results)
    ]


def _violations(results: Graph) -> list[tuple[str, str | None]]:
    from rdflib.namespace import SH

    out: list[tuple[str, str | None]] = []
    for result in results.subjects(SH.resultSeverity, SH.Violation):
        focus = results.value(result, SH.focusNode)
        path = results.value(result, SH.resultPath)
        out.append((str(focus), str(path) if path else None))
    return out


def report(
    ds: Dataset, store: RdfDataset | None = None, shapes_ttl: str | None = None
) -> QualityReport:
    """Check a dataset and, when shapes and RDF are supplied, its graphs as well."""
    counts = ds.counts()
    result = QualityReport(
        checked_at=datetime.now(tz=UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        entities=counts["entities"],
        positions=counts["positions"],
        dangling_references=validate(ds),
        subsidiary_cycles=subsidiary_cycles(ds),
        missing_identifiers=missing_identifiers(ds),
    )
    if store is not None and shapes_ttl:
        merged = Graph()
        for g in store.graphs():
            merged += g
        result.shacl_violations = shacl_violations(merged, shapes_ttl)
    return result


def default_shapes_path() -> Path:
    return Path(__file__).resolve().parents[3] / "ontology" / "shapes.ttl"
