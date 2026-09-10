from pathlib import Path

import pytest

from tradegraph_etl.model import Dataset, Entity, Filing, Position
from tradegraph_etl.sources.sample import DEFAULT_SAMPLE_DIR, read_sample

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="session")
def sample_dataset() -> Dataset:
    return read_sample(DEFAULT_SAMPLE_DIR)


@pytest.fixture(scope="session")
def ontology_ttl() -> str:
    return (ROOT / "ontology" / "tradegraph.ttl").read_text()


@pytest.fixture
def tiny_dataset() -> Dataset:
    """Two funds in one family, one issuer with a finance subsidiary."""
    ds = Dataset()
    ds.entities += [
        Entity(id="0000000001", name="Acme Corp", kind="ISSUER", cik="0000000001", ticker="ACME"),
        Entity(
            id="S00000101",
            name="Acme Finance Corp.",
            kind="SUBSIDIARY",
            parent="0000000001",
            ownership=0.8,
            jurisdiction="DE",
            filing="0000000001-24-000001",
        ),
        Entity(
            id="S0000010101",
            name="Acme Regional Unit 1 Ltd.",
            kind="SUBSIDIARY",
            parent="S00000101",
            jurisdiction="GB",
            filing="0000000001-24-000001",
        ),
        Entity(id="0000000002", name="Bigfund Inc", kind="FUND", cik="0000000002", ticker="BIGF"),
        Entity(
            id="F00000201",
            name="Bigfund Growth Fund",
            kind="FUND",
            parent="0000000002",
            jurisdiction="US",
        ),
    ]
    ds.filings += [
        Filing(
            accession="0000000001-24-000001",
            form_type="10-K",
            filer="0000000001",
            period="2023-12-31",
        ),
        Filing(
            accession="0000000002-24-000001",
            form_type="13F-HR",
            filer="0000000002",
            period="2024-06-30",
        ),
        Filing(
            accession="0000000002-24-000002",
            form_type="13F-HR",
            filer="F00000201",
            period="2024-06-30",
        ),
    ]
    ds.positions += [
        Position(
            filing="0000000002-24-000001",
            index=0,
            holder="0000000002",
            issuer="0000000001",
            issuer_name="Acme Corp",
            instrument_class="COMMON",
            cusip="900000001",
            ticker="ACME",
            quantity=100,
            value=1000.0,
            as_of="2024-06-30",
        ),
        Position(
            filing="0000000002-24-000002",
            index=0,
            holder="F00000201",
            issuer="S00000101",
            issuer_name="Acme Finance Corp.",
            instrument_class="DEBT",
            cusip="900000002",
            ticker=None,
            quantity=50000,
            value=49000.5,
            as_of="2024-06-30",
        ),
    ]
    return ds
