import pytest

from tradegraph_etl.model import Entity, Filing
from tradegraph_etl.sources.edgar import (
    EdgarClient,
    normalise,
    parse_info_table,
    resolve_issuers,
)

INFO_TABLE = """<?xml version="1.0" encoding="UTF-8"?>
<informationTable xmlns="http://www.sec.gov/edgar/document/thirteenf/informationtable">
  <infoTable>
    <nameOfIssuer>APPLE INC</nameOfIssuer>
    <titleOfClass>COM</titleOfClass>
    <cusip>037833100</cusip>
    <value>84248000000</value>
    <shrsOrPrnAmt><sshPrnamt>400000000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt>
    <investmentDiscretion>SOLE</investmentDiscretion>
  </infoTable>
  <infoTable>
    <nameOfIssuer>UNKNOWN CO</nameOfIssuer>
    <titleOfClass>COM</titleOfClass>
    <cusip>999999999</cusip>
    <value>1</value>
    <shrsOrPrnAmt><sshPrnamt>1</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt>
    <putCall>Put</putCall>
  </infoTable>
</informationTable>
"""


def test_parse_info_table_reads_positions():
    filing = Filing(
        accession="0001067983-24-000001",
        form_type="13F-HR",
        filer="0001067983",
        period="2024-06-30",
    )
    rows = parse_info_table(INFO_TABLE, filing, "0001067983")
    assert len(rows) == 2
    assert rows[0].issuer_name == "APPLE INC"
    assert rows[0].cusip == "037833100"
    assert rows[0].value == 84248000000.0
    assert rows[0].quantity == 400000000.0
    assert rows[0].instrument_class == "COMMON"
    assert rows[1].instrument_class == "PUT"


def test_resolve_issuers_by_normalised_name():
    filing = Filing(accession="a", form_type="13F-HR", filer="x", period="2024-06-30")
    rows = parse_info_table(INFO_TABLE, filing, "x")
    issuers = [
        Entity(id="0000320193", name="Apple Inc.", kind="ISSUER", cik="0000320193", ticker="AAPL")
    ]
    resolved = resolve_issuers(rows, issuers)
    assert [p.issuer for p in resolved] == ["0000320193"]
    assert resolved[0].ticker == "AAPL"


def test_normalise_strips_punctuation_and_suffixes():
    assert normalise("Apple Inc.") == normalise("APPLE INC") == "APPLE"
    assert normalise("Berkshire Hathaway Inc /DE/") == "BERKSHIRE HATHAWAY"


def test_client_requires_contact_in_user_agent():
    with pytest.raises(ValueError):
        EdgarClient("TradeGraph")
    assert EdgarClient("TradeGraph say@example.com") is not None
