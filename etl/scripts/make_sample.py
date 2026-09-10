"""Build the deterministic sample dataset under etl/sample.

Issuers come from the public SEC ``company_tickers.json`` snapshot. Everything
else (fund families, Exhibit 21 style subsidiaries, 13F style holdings) is
synthetic and derived from a fixed seed so the output is reproducible.

    uv run python scripts/make_sample.py --tickers company_tickers.json --out sample
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
from pathlib import Path

SEED = 20240630
AS_OF = "2024-06-30"
PRIOR_AS_OF = "2024-03-31"
ISSUER_COUNT = 3600
SUBSIDIARY_PARENTS = 420
MANAGER_TICKERS = [
    "BLK",
    "TROW",
    "IVZ",
    "BEN",
    "AMP",
    "AMG",
    "JHG",
    "APO",
    "KKR",
    "BX",
    "CG",
    "ARES",
    "CNS",
    "VRTS",
    "FHI",
    "APAM",
    "VCTR",
    "GS",
    "MS",
    "JPM",
    "BAC",
    "WFC",
    "C",
    "NTRS",
    "STT",
    "BK",
    "RJF",
    "SF",
    "SCHW",
    "LPLA",
    "BRK-B",
    "PFG",
    "PRU",
    "MET",
    "ALL",
    "TRV",
    "CB",
    "PGR",
    "AIG",
    "HIG",
    "L",
    "MKL",
    "WRB",
    "CINF",
    "VOYA",
    "EQH",
    "CRBG",
    "JXN",
    "STEP",
    "HLNE",
    "TPG",
    "OWL",
    "LAZ",
    "EVR",
    "PJT",
    "HLI",
    "MC",
    "SEIC",
    "WTM",
    "RGA",
]
FUND_TEMPLATES = [
    ("{base} Strategic Equity Fund", "US"),
    ("{base} Global Select Fund", "US"),
    ("{base} Income Opportunities Fund", "US"),
    ("{base} Small Cap Growth Fund", "US"),
    ("{base} International Value Fund", "IE"),
    ("{base} Total Return Bond Fund", "US"),
    ("{base} Dividend Focus Fund", "US"),
    ("{base} Technology Leaders Fund", "LU"),
]
# Percentage owned as an Exhibit 21 style list would state it. ``None`` stands for
# a line with no percentage, which the ETL treats as wholly owned and flags.
OWNERSHIP = (None, 1.0, 0.8, 0.6, None, 0.51, 1.0, 0.75, None, 0.9)
SUBSIDIARY_TEMPLATES = [
    ("{base} Holdings LLC", "DE"),
    ("{base} International B.V.", "NL"),
    ("{base} Finance Corp.", "DE"),
    ("{base} (UK) Limited", "GB"),
    ("{base} Ireland Limited", "IE"),
    ("{base} Capital Markets Inc.", "NY"),
    ("{base} Services GmbH", "DE-BY"),
    ("{base} Japan K.K.", "JP"),
    ("{base} Canada Inc.", "CA"),
    ("{base} Singapore Pte. Ltd.", "SG"),
    ("{base} Operations LLC", "DE"),
    ("{base} Luxembourg S.a r.l.", "LU"),
]
# Issuers (by CIK) left out of the sample.
EXCLUDED_CIKS = frozenset(
    {
        "0000862861",
        "0001086745",
        "0001130781",
        "0001318605",
        "0001416090",
        "0001473490",
        "0001477960",
        "0001563568",
        "0001577445",
        "0001577526",
        "0001592560",
        "0001605331",
        "0001648960",
        "0001649009",
        "0001663038",
        "0001682149",
        "0001708441",
        "0001717115",
        "0001735514",
        "0001737270",
        "0001742341",
        "0001804469",
        "0001818274",
        "0001819142",
        "0001826681",
        "0001829247",
        "0001833498",
        "0001836981",
        "0001840856",
        "0001842566",
        "0001853138",
        "0001861622",
        "0001863990",
        "0001895618",
        "0001897087",
        "0001913749",
        "0001920294",
        "0001932737",
        "0001958399",
        "0001969302",
        "0001993431",
        "0001994624",
        "0001999124",
        "0002001699",
        "0002022308",
        "0002030763",
        "0002073553",
        "0002075335",
        "0002084585",
        "0002094076",
        "0002111860",
        "0002131101",
    }
)
SUFFIX_RE = re.compile(
    r"\b(inc\.?|corp\.?|corporation|co\.?|company|ltd\.?|limited|plc|llc|l\.p\.|lp|"
    r"holdings?|group|n\.v\.|s\.a\.|se|ag|trust|/de/?|/[a-z]{2}/?)\b\.?",
    re.IGNORECASE,
)


def base_name(title: str) -> str:
    name = SUFFIX_RE.sub("", title)
    name = re.sub(r"[,&]+", " ", name)
    name = re.sub(r"\s+", " ", name).strip(" .-")
    words = name.split()
    return " ".join(w if w.isupper() and len(w) <= 4 else w.title() for w in words[:3]) or title


def cusip_for(key: str) -> str:
    digest = hashlib.sha1(key.encode()).hexdigest().upper()
    return "9" + digest[:7] + str(int(digest[7], 16) % 10)


def cik10(cik: int | str) -> str:
    return f"{int(cik):010d}"


def owned(subsidiary_id: str) -> dict:
    """The stated percentage owned for a subsidiary, or nothing when the list gave none."""
    digest = hashlib.sha1(subsidiary_id.encode()).hexdigest()
    stated = OWNERSHIP[int(digest[:8], 16) % len(OWNERSHIP)]
    return {} if stated is None else {"ownership": stated}


def prior_table(table: list[dict], seq: int, issuers: list[dict], prices: dict) -> list[dict]:
    """The previous quarter of a 13F table.

    The first two lines of the current table are new this quarter, every third
    carried line moved by twenty percent, and one line that was sold during the
    quarter is still present.
    """
    carried = []
    for i, row in enumerate(table[2:]):
        prev = dict(row)
        if i % 3 == 0:
            prev["sshPrnamt"] = int(row["sshPrnamt"] * 0.8)
            prev["value"] = round(row["value"] * 0.8, 2)
        carried.append(prev)
    held = {row["cusip"] for row in table}
    for step in range(len(issuers)):
        sold = issuers[(seq * 7919 + step) % len(issuers)]
        cusip = cusip_for(sold["ticker"] + "COMMON")
        if cusip not in held:
            break
    shares = 1_000 + (seq * 977) % 900_000
    carried.append(
        {
            "nameOfIssuer": sold["name"],
            "issuerCik": sold["cik"],
            "ticker": sold["ticker"],
            "titleOfClass": "COMMON",
            "cusip": cusip,
            "value": round(shares * prices[sold["ticker"]], 2),
            "sshPrnamt": shares,
        }
    )
    return carried


def build(tickers_path: Path, out: Path) -> None:
    rng = random.Random(SEED)
    raw = json.loads(tickers_path.read_text())
    rows = [
        {"cik": cik10(r["cik_str"]), "ticker": r["ticker"], "name": r["title"]}
        for r in raw.values()
    ]
    seen: set[str] = set()
    issuers = []
    for r in rows:
        if r["cik"] in seen or r["cik"] in EXCLUDED_CIKS:
            continue
        seen.add(r["cik"])
        issuers.append(r)
        if len(issuers) >= ISSUER_COUNT:
            break
    by_ticker = {r["ticker"]: r for r in issuers}

    managers = [by_ticker[t] for t in MANAGER_TICKERS if t in by_ticker]
    funds = []
    for m in managers:
        base = base_name(m["name"])
        funds.append(
            {
                "id": m["cik"],
                "name": m["name"],
                "cik": m["cik"],
                "parent": None,
                "jurisdiction": "US",
            }
        )
        for i, (tpl, jur) in enumerate(FUND_TEMPLATES[: rng.randint(4, 8)], start=1):
            funds.append(
                {
                    "id": f"F{m['cik'][-6:]}{i:02d}",
                    "name": tpl.format(base=base),
                    "cik": None,
                    "parent": m["cik"],
                    "jurisdiction": jur,
                }
            )

    subsidiaries = []
    for issuer in issuers[:SUBSIDIARY_PARENTS]:
        base = base_name(issuer["name"])
        picks = rng.sample(SUBSIDIARY_TEMPLATES, rng.randint(2, 6))
        first_level = []
        for i, (tpl, jur) in enumerate(picks, start=1):
            sid = f"S{issuer['cik'][-6:]}{i:02d}"
            subsidiaries.append(
                {
                    "id": sid,
                    "name": tpl.format(base=base),
                    "parent": issuer["cik"],
                    "jurisdiction": jur,
                    "filing": f"{issuer['cik']}-24-000001",
                }
                | owned(sid)
            )
            first_level.append(sid)
        if rng.random() < 0.5:
            parent_sid = rng.choice(first_level)
            for j in range(1, rng.randint(1, 3) + 1):
                unit_sid = f"{parent_sid}{j:02d}"
                subsidiaries.append(
                    {
                        "id": unit_sid,
                        "name": f"{base} Regional Unit {j} Ltd.",
                        "parent": parent_sid,
                        "jurisdiction": rng.choice(["GB", "DE", "FR", "AU", "BR", "IN"]),
                        "filing": f"{issuer['cik']}-24-000001",
                    }
                    | owned(unit_sid)
                )

    debt_issuers = [s for s in subsidiaries if "Finance" in s["name"] or "Capital" in s["name"]]
    prices = {r["ticker"]: round(rng.uniform(4.0, 620.0), 2) for r in issuers}
    issuer_weights = [1.0 / (1 + i / 200.0) for i in range(len(issuers))]

    holdings: dict[str, list] = {}
    for seq, fund in enumerate(funds, start=1):
        family = fund["parent"] or fund["id"]
        filer_cik = fund["cik"] or fund["parent"]
        accession = f"{filer_cik}-24-{seq:06d}"
        n = rng.randint(12, 45)
        weights = [int(w * 100) for w in issuer_weights]
        picked = dict.fromkeys(rng.sample(range(len(issuers)), k=n, counts=weights))
        table = []
        for idx in picked:
            issuer = issuers[idx]
            shares = rng.randint(1_000, 2_500_000)
            cls = "COMMON" if rng.random() < 0.85 else rng.choice(["PUT", "CALL", "PREFERRED"])
            table.append(
                {
                    "nameOfIssuer": issuer["name"],
                    "issuerCik": issuer["cik"],
                    "ticker": issuer["ticker"],
                    "titleOfClass": cls,
                    "cusip": cusip_for(issuer["ticker"] + cls),
                    "value": round(shares * prices[issuer["ticker"]], 2),
                    "sshPrnamt": shares,
                }
            )
        for sub in rng.sample(debt_issuers, k=rng.randint(1, 4)):
            face = rng.randint(50, 5_000) * 1000
            table.append(
                {
                    "nameOfIssuer": sub["name"],
                    "issuerId": sub["id"],
                    "ticker": None,
                    "titleOfClass": "DEBT",
                    "cusip": cusip_for(sub["id"] + "DEBT"),
                    "value": round(face * rng.uniform(0.82, 1.04), 2),
                    "sshPrnamt": face,
                }
            )
        holdings.setdefault(family, []).append(
            {
                "accessionNumber": accession,
                "formType": "13F-HR",
                "filerId": fund["id"],
                "periodOfReport": AS_OF,
                "infoTable": table,
            }
        )
        holdings[family].append(
            {
                "accessionNumber": f"{filer_cik}-24-{seq + 500:06d}",
                "formType": "13F-HR",
                "filerId": fund["id"],
                "periodOfReport": PRIOR_AS_OF,
                "infoTable": prior_table(table, seq, issuers, prices),
            }
        )

    out.mkdir(parents=True, exist_ok=True)
    (out / "holdings").mkdir(exist_ok=True)
    (out / "issuers.json").write_text(json.dumps(issuers, separators=(",", ":"), indent=0))
    (out / "funds.json").write_text(json.dumps(funds, indent=1))
    (out / "subsidiaries.json").write_text(
        json.dumps(subsidiaries, separators=(",", ":"), indent=0)
    )
    for family, filings in holdings.items():
        (out / "holdings" / f"{family}.json").write_text(json.dumps(filings, separators=(",", ":")))
    filings = [f for fs in holdings.values() for f in fs]
    positions = sum(len(f["infoTable"]) for f in filings)
    print(
        f"issuers={len(issuers)} funds={len(funds)} subsidiaries={len(subsidiaries)} "
        f"entities={len(issuers) + len(funds) + len(subsidiaries)} "
        f"filings={len(filings)} positions={positions} periods={PRIOR_AS_OF},{AS_OF}"
    )


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=Path("sample"))
    args = ap.parse_args()
    build(args.tickers, args.out)
