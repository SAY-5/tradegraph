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
        if r["cik"] in seen:
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
            )
            first_level.append(sid)
        if rng.random() < 0.5:
            parent_sid = rng.choice(first_level)
            for j in range(1, rng.randint(1, 3) + 1):
                subsidiaries.append(
                    {
                        "id": f"{parent_sid}{j:02d}",
                        "name": f"{base} Regional Unit {j} Ltd.",
                        "parent": parent_sid,
                        "jurisdiction": rng.choice(["GB", "DE", "FR", "AU", "BR", "IN"]),
                        "filing": f"{issuer['cik']}-24-000001",
                    }
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
        picked = rng.sample(range(len(issuers)), k=n, counts=weights)
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

    out.mkdir(parents=True, exist_ok=True)
    (out / "holdings").mkdir(exist_ok=True)
    (out / "issuers.json").write_text(json.dumps(issuers, separators=(",", ":"), indent=0))
    (out / "funds.json").write_text(json.dumps(funds, indent=1))
    (out / "subsidiaries.json").write_text(
        json.dumps(subsidiaries, separators=(",", ":"), indent=0)
    )
    for family, filings in holdings.items():
        (out / "holdings" / f"{family}.json").write_text(json.dumps(filings, separators=(",", ":")))
    positions = sum(len(f["infoTable"]) for fs in holdings.values() for f in fs)
    print(
        f"issuers={len(issuers)} funds={len(funds)} subsidiaries={len(subsidiaries)} "
        f"entities={len(issuers) + len(funds) + len(subsidiaries)} positions={positions}"
    )


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--tickers", type=Path, required=True)
    ap.add_argument("--out", type=Path, default=Path("sample"))
    args = ap.parse_args()
    build(args.tickers, args.out)
