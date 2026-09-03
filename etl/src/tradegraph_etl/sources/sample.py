"""Read the committed sample dataset (see ``sample/README.md``)."""

from __future__ import annotations

import json
from pathlib import Path

from tradegraph_etl.model import Dataset, Entity, Filing, Position

DEFAULT_SAMPLE_DIR = Path(__file__).resolve().parents[3] / "sample"


def read_sample(sample_dir: Path = DEFAULT_SAMPLE_DIR) -> Dataset:
    ds = Dataset()
    issuers = json.loads((sample_dir / "issuers.json").read_text())
    funds = json.loads((sample_dir / "funds.json").read_text())
    subsidiaries = json.loads((sample_dir / "subsidiaries.json").read_text())

    for r in issuers:
        ds.entities.append(
            Entity(id=r["cik"], name=r["name"], kind="ISSUER", cik=r["cik"], ticker=r["ticker"])
        )
    for r in funds:
        ds.entities.append(
            Entity(
                id=r["id"],
                name=r["name"],
                kind="FUND",
                cik=r["cik"],
                parent=r["parent"],
                jurisdiction=r["jurisdiction"],
            )
        )
    seen_filings: set[str] = set()
    for r in subsidiaries:
        ds.entities.append(
            Entity(
                id=r["id"],
                name=r["name"],
                kind="SUBSIDIARY",
                parent=r["parent"],
                jurisdiction=r["jurisdiction"],
                filing=r["filing"],
            )
        )
        if r["filing"] not in seen_filings:
            seen_filings.add(r["filing"])
            ds.filings.append(
                Filing(
                    accession=r["filing"],
                    form_type="10-K",
                    filer=r["filing"].split("-")[0],
                    period="2023-12-31",
                )
            )

    for path in sorted((sample_dir / "holdings").glob("*.json")):
        for filing in json.loads(path.read_text()):
            ds.filings.append(
                Filing(
                    accession=filing["accessionNumber"],
                    form_type=filing["formType"],
                    filer=filing["filerId"],
                    period=filing["periodOfReport"],
                )
            )
            for i, row in enumerate(filing["infoTable"]):
                ds.positions.append(
                    Position(
                        filing=filing["accessionNumber"],
                        index=i,
                        holder=filing["filerId"],
                        issuer=row.get("issuerCik") or row["issuerId"],
                        issuer_name=row["nameOfIssuer"],
                        instrument_class=row["titleOfClass"],
                        cusip=row["cusip"],
                        ticker=row.get("ticker"),
                        quantity=float(row["sshPrnamt"]),
                        value=float(row["value"]),
                        as_of=filing["periodOfReport"],
                    )
                )
    return ds
