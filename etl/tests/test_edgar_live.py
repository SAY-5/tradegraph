"""``build_live`` against recorded EDGAR responses.

The live path has no Exhibit 21 reader, so it produces holdings and no corporate
tree. That is asserted here rather than left to the documentation.
"""

from __future__ import annotations

from tradegraph_etl import transform
from tradegraph_etl.model import Entity, Filing
from tradegraph_etl.sources.edgar import build_live, parse_info_table

TICKERS = [
    Entity(
        id="0000320193",
        name="Apple Inc.",
        kind="ISSUER",
        cik="0000320193",
        ticker="AAPL",
    ),
    Entity(
        id="0000789019",
        name="Microsoft Corporation",
        kind="ISSUER",
        cik="0000789019",
        ticker="MSFT",
    ),
]

INFO_TABLE = """<?xml version="1.0" encoding="UTF-8"?>
<informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">
  <infoTable>
    <nameOfIssuer>APPLE INC</nameOfIssuer>
    <titleOfClass>COM</titleOfClass>
    <cusip>037833100</cusip>
    <value>84248000000</value>
    <shrsOrPrnAmt><sshPrnamt>400000000</sshPrnamt></shrsOrPrnAmt>
  </infoTable>
  <infoTable>
    <nameOfIssuer>MICROSOFT CORP</nameOfIssuer>
    <titleOfClass>COM</titleOfClass>
    <cusip>594918104</cusip>
    <value>1000000</value>
    <shrsOrPrnAmt><sshPrnamt>2500</sshPrnamt></shrsOrPrnAmt>
  </infoTable>
  <infoTable>
    <nameOfIssuer>A COMPANY NOT IN THE TICKER LIST</nameOfIssuer>
    <titleOfClass>COM</titleOfClass>
    <cusip>999999999</cusip>
    <value>7</value>
    <shrsOrPrnAmt><sshPrnamt>1</sshPrnamt></shrsOrPrnAmt>
  </infoTable>
</informationTable>
"""

SUBMISSIONS = {
    "cik": 1067983,
    "name": "BERKSHIRE HATHAWAY INC",
    "filings": {
        "recent": {
            "accessionNumber": ["0000950123-24-008740", "0001067983-24-000012"],
            "form": ["8-K", "13F-HR"],
            "reportDate": ["2024-05-04", "2024-06-30"],
        }
    },
}


class RecordedEdgar:
    """Stands in for ``EdgarClient`` with the two responses ``build_live`` reads."""

    def __init__(self) -> None:
        self.info_table_calls: list[str] = []

    def company_tickers(self, limit: int | None = None) -> list[Entity]:
        return list(TICKERS[:limit] if limit else TICKERS)

    def submissions(self, cik: str) -> dict:
        return SUBMISSIONS

    def latest_filing(self, submissions: dict, form: str) -> Filing | None:
        recent = submissions["filings"]["recent"]
        for accession, kind, period in zip(
            recent["accessionNumber"], recent["form"], recent["reportDate"], strict=True
        ):
            if kind == form:
                return Filing(
                    accession=accession,
                    form_type=form,
                    filer="0001067983",
                    period=period,
                )
        return None

    def info_table(self, cik: str, filing: Filing) -> str | None:
        self.info_table_calls.append(filing.accession)
        return INFO_TABLE


def test_build_live_resolves_holdings_by_normalised_issuer_name():
    client = RecordedEdgar()
    ds = build_live(client, ["0001067983"], log=lambda *_: None)

    assert client.info_table_calls == ["0001067983-24-000012"]
    assert [f.accession for f in ds.filings] == ["0001067983-24-000012"]
    assert [(p.issuer, p.ticker, p.value) for p in ds.positions] == [
        ("0000320193", "AAPL", 84248000000.0),
    ]
    assert all(p.as_of == "2024-06-30" for p in ds.positions)


def test_build_live_drops_the_rows_it_cannot_resolve():
    """Resolution is by normalised name, because EDGAR publishes no CUSIP to CIK map.

    Two of the three information table rows are dropped: ``MICROSOFT CORP``
    normalises to ``MICROSOFT`` while the ticker list title ``Microsoft
    Corporation`` keeps its suffix, and the last row names a company the list
    does not carry at all.
    """
    filing = Filing(
        accession="0001067983-24-000012",
        form_type="13F-HR",
        filer="0001067983",
        period="2024-06-30",
    )
    assert len(parse_info_table(INFO_TABLE, filing, "0001067983")) == 3

    ds = build_live(RecordedEdgar(), ["0001067983"], log=lambda *_: None)
    assert [p.issuer for p in ds.positions] == ["0000320193"]


def test_build_live_types_the_filer_as_a_fund():
    ds = build_live(RecordedEdgar(), ["0001067983"], log=lambda *_: None)
    filer = next(e for e in ds.entities if e.id == "0001067983")
    assert filer.kind == "FUND"
    assert filer.name == "BERKSHIRE HATHAWAY INC"


def test_build_live_produces_no_corporate_tree():
    """No Exhibit 21 source, so no parent and no subsidiaryOf triple."""
    ds = build_live(RecordedEdgar(), ["0001067983"], log=lambda *_: None)
    assert [e.id for e in ds.entities if e.parent is not None] == []

    store = transform.to_rdf(ds)
    assert list(store.quads((None, transform.TG.subsidiaryOf, None, None))) == []
    assert list(store.quads((None, transform.TG.hasSubsidiary, None, None))) == []
