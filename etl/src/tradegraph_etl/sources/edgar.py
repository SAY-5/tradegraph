"""Live source: pull issuers and 13F-HR holdings from SEC EDGAR.

EDGAR asks for a descriptive User-Agent with contact details and allows at
most ten requests per second; ``EdgarClient`` enforces both.

There is no Exhibit 21 reader here, so ``build_live`` sets no ``Entity.parent``
and the transform emits no ``tg:subsidiaryOf`` edge from live data. Lineage and
the exposure legs that walk it come from the committed sample (``--sample``).
"""

from __future__ import annotations

import re
import time
import xml.etree.ElementTree as ET
from collections.abc import Iterable

import httpx

from tradegraph_etl.model import Dataset, Entity, Filing, Position
from tradegraph_etl.periods import isoformat

TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
ARCHIVE_URL = "https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc_nodash}/"

# Well known 13F filers used when no explicit CIK list is given.
DEFAULT_13F_FILERS = [
    "0001067983",  # Berkshire Hathaway
    "0001364742",  # BlackRock
    "0000093751",  # State Street
    "0000315066",  # FMR
    "0000102909",  # Vanguard Group
]


def cik10(value: int | str) -> str:
    return f"{int(value):010d}"


class EdgarClient:
    def __init__(self, user_agent: str, rate_per_second: float = 8.0, timeout: float = 60.0):
        if "@" not in user_agent:
            raise ValueError("SEC requires a User-Agent with a contact email, e.g. 'Name email@x'")
        self._client = httpx.Client(
            headers={"User-Agent": user_agent, "Accept-Encoding": "gzip, deflate"},
            timeout=timeout,
            follow_redirects=True,
        )
        self._interval = 1.0 / rate_per_second
        self._last = 0.0

    def _throttle(self) -> None:
        wait = self._interval - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        self._last = time.monotonic()

    def get(self, url: str) -> httpx.Response:
        self._throttle()
        resp = self._client.get(url)
        resp.raise_for_status()
        return resp

    def company_tickers(self, limit: int | None = None) -> list[Entity]:
        raw = self.get(TICKERS_URL).json()
        out: list[Entity] = []
        seen: set[str] = set()
        for row in raw.values():
            cik = cik10(row["cik_str"])
            if cik in seen:
                continue
            seen.add(cik)
            out.append(
                Entity(id=cik, name=row["title"], kind="ISSUER", cik=cik, ticker=row["ticker"])
            )
            if limit and len(out) >= limit:
                break
        return out

    def submissions(self, cik: str) -> dict:
        return self.get(SUBMISSIONS_URL.format(cik=cik10(cik))).json()

    def latest_filing(self, submissions: dict, form: str) -> Filing | None:
        recent = submissions.get("filings", {}).get("recent", {})
        for acc, ftype, period in zip(
            recent.get("accessionNumber", []),
            recent.get("form", []),
            recent.get("reportDate", []),
            strict=False,
        ):
            if ftype != form:
                continue
            try:
                normalised = isoformat(period)
            except ValueError:
                continue
            return Filing(
                accession=acc, form_type=form, filer=cik10(submissions["cik"]), period=normalised
            )
        return None

    def filing_index(self, cik: str, accession: str) -> list[str]:
        url = ARCHIVE_URL.format(cik_int=int(cik), acc_nodash=accession.replace("-", ""))
        html = self.get(url).text
        return [url + m for m in re.findall(r'href="[^"]*/([^"/]+\.(?:xml|htm|html|txt))"', html)]

    def info_table(self, cik: str, filing: Filing) -> str | None:
        for href in self.filing_index(cik, filing.accession):
            name = href.rsplit("/", 1)[-1].lower()
            if name.endswith(".xml") and "primary_doc" not in name:
                return self.get(href).text
        return None


def parse_info_table(xml_text: str, filing: Filing, holder: str) -> list[Position]:
    """Parse a 13F-HR information table XML into positions.

    Issuer resolution by CUSIP requires a CUSIP to CIK map that EDGAR does not
    publish; ``build_live`` resolves by normalised issuer name against the
    company tickers list and skips rows it cannot resolve.
    """
    root = ET.fromstring(xml_text)
    ns = {"n": root.tag.split("}")[0].strip("{")} if root.tag.startswith("{") else {}
    prefix = "n:" if ns else ""
    rows: list[Position] = []

    def text(node: ET.Element, path: str) -> str:
        el = node.find(prefix + path.replace("/", "/" + prefix), ns)
        return (el.text or "").strip() if el is not None else ""

    for i, it in enumerate(root.findall(f".//{prefix}infoTable", ns)):
        put_call = text(it, "putCall").upper()
        cls = put_call if put_call in ("PUT", "CALL") else "COMMON"
        rows.append(
            Position(
                filing=filing.accession,
                index=i,
                holder=holder,
                issuer="",
                issuer_name=text(it, "nameOfIssuer"),
                instrument_class=cls,
                cusip=text(it, "cusip"),
                ticker=None,
                quantity=float(text(it, "shrsOrPrnAmt/sshPrnamt") or 0),
                value=float(text(it, "value") or 0),
                as_of=filing.period,
            )
        )
    return rows


_NORM = re.compile(r"[^A-Z0-9]+")


def normalise(name: str) -> str:
    name = _NORM.sub(" ", name.upper()).strip()
    suffixes = (" INC", " CORP", " CO", " LTD", " PLC", " LLC", " HOLDINGS", " NEW", " DE", " DEL")
    stripped = True
    while stripped:
        stripped = False
        for suffix in suffixes:
            if name.endswith(suffix):
                name = name[: -len(suffix)].strip()
                stripped = True
    return name


def resolve_issuers(positions: Iterable[Position], issuers: list[Entity]) -> list[Position]:
    by_name = {normalise(e.name): e for e in issuers}
    out: list[Position] = []
    for p in positions:
        e = by_name.get(normalise(p.issuer_name))
        if e is None:
            continue
        out.append(
            Position(
                filing=p.filing,
                index=p.index,
                holder=p.holder,
                issuer=e.id,
                issuer_name=e.name,
                instrument_class=p.instrument_class,
                cusip=p.cusip,
                ticker=e.ticker,
                quantity=p.quantity,
                value=p.value,
                as_of=p.as_of,
            )
        )
    return out


def build_live(
    client: EdgarClient,
    fund_ciks: list[str] | None = None,
    issuer_limit: int | None = None,
    log=print,
) -> Dataset:
    ds = Dataset()
    ds.entities.extend(client.company_tickers(limit=issuer_limit))
    issuer_ids = {e.id for e in ds.entities}
    for cik in fund_ciks or DEFAULT_13F_FILERS:
        cik = cik10(cik)
        subs = client.submissions(cik)
        if cik not in issuer_ids:
            ds.entities.append(Entity(id=cik, name=subs["name"], kind="FUND", cik=cik))
        else:
            ds.entities = [
                Entity(**{**e.__dict__, "kind": "FUND"}) if e.id == cik else e for e in ds.entities
            ]
        filing = client.latest_filing(subs, "13F-HR")
        if filing is None:
            log(f"{cik}: no 13F-HR filing")
            continue
        xml_text = client.info_table(cik, filing)
        if xml_text is None:
            log(f"{cik}: no information table in {filing.accession}")
            continue
        resolved = resolve_issuers(parse_info_table(xml_text, filing, cik), ds.entities)
        ds.filings.append(filing)
        ds.positions.extend(resolved)
        log(f"{cik}: {filing.accession} {len(resolved)} positions resolved")
    return ds
