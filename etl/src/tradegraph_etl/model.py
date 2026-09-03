"""Plain data records shared by the sources and the RDF transform."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Entity:
    """A legal entity. ``kind`` is one of ISSUER, FUND, SUBSIDIARY."""

    id: str
    name: str
    kind: str
    cik: str | None = None
    ticker: str | None = None
    lei: str | None = None
    parent: str | None = None
    jurisdiction: str | None = None
    sic: str | None = None
    filing: str | None = None


@dataclass(frozen=True)
class Filing:
    accession: str
    form_type: str
    filer: str
    period: str


@dataclass(frozen=True)
class Position:
    filing: str
    index: int
    holder: str
    issuer: str
    issuer_name: str
    instrument_class: str
    cusip: str
    ticker: str | None
    quantity: float
    value: float
    as_of: str


@dataclass
class Dataset:
    entities: list[Entity] = field(default_factory=list)
    filings: list[Filing] = field(default_factory=list)
    positions: list[Position] = field(default_factory=list)

    def entity_count(self) -> int:
        return len(self.entities)

    def counts(self) -> dict[str, int]:
        kinds: dict[str, int] = {}
        for e in self.entities:
            kinds[e.kind] = kinds.get(e.kind, 0) + 1
        return {
            "entities": len(self.entities),
            "issuers": kinds.get("ISSUER", 0),
            "funds": kinds.get("FUND", 0),
            "subsidiaries": kinds.get("SUBSIDIARY", 0),
            "filings": len(self.filings),
            "positions": len(self.positions),
        }
