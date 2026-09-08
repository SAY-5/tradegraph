"""Scripted lineage and exposure queries against a running API. Prints the demo summary."""

from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request

API = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"

# (fund query, issuer ticker) pairs chosen because the sample gives them non-zero exposure
PAIRS = [
    ("Invesco Strategic Equity Fund", "NVDA"),
    ("Lazard Strategic Equity Fund", "GOOGL"),
    ("Chubb Strategic Equity Fund", "NVDA"),
]
LINEAGE = ["AAPL", "JPM"]


def get(path: str, **params):
    url = f"{API}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    started = time.perf_counter()
    with urllib.request.urlopen(url, timeout=60) as resp:
        body = json.load(resp)
    return body, (time.perf_counter() - started) * 1000


def first(q: str):
    body, _ = get("/entities", q=q, limit=1)
    if not body:
        raise SystemExit(f"no entity for {q!r}")
    return body[0]


def money(v) -> str:
    return f"${float(v):,.0f}"


def main() -> None:
    health, _ = get("/actuator/health")
    stats, stats_ms = get("/stats")
    print("TradeGraph demo summary")
    print("=======================")
    print(f"store            : {stats['store']} ({health['components']['store']['details']['queryUrl']})")
    print(f"entities loaded  : {stats['entities']:,} (issuers {stats['issuers']:,}, funds {stats['funds']:,}, "
          f"subsidiaries {stats['subsidiaries']:,})")
    print(f"positions        : {stats['positions']:,} in {stats['filings']:,} filings")
    print(f"lineage edges    : {stats['lineageEdges']:,}")
    print(f"triples          : {stats['triples']:,}")
    print(f"stats query      : {stats_ms:.0f} ms")
    print()
    print("Lineage")
    for ticker in LINEAGE:
        e = first(ticker)
        lineage, ms = get(f"/entities/{e['id']}/lineage")
        print(f"  {e['name']} ({ticker}): {lineage['descendantCount']} subsidiaries, "
              f"deepest level {lineage['deepestLevel']}, {ms:.0f} ms")
    print()
    print("Exposure (fund to issuer, through subsidiaries and affiliates)")
    for fund_q, ticker in PAIRS:
        fund = first(fund_q)
        issuer = first(ticker)
        r, ms = get(f"/entities/{fund['id']}/exposure", issuer=issuer["id"])
        r2, ms_cached = get(f"/entities/{fund['id']}/exposure", issuer=issuer["id"])
        print(f"  {fund['name']} -> {issuer['name']} ({ticker})")
        print(f"    total {money(r['totalValue'])}  direct {money(r['directValue'])}  "
              f"via subsidiaries {money(r['viaSubsidiariesValue'])}  via affiliates {money(r['viaAffiliatesValue'])}")
        print(f"    {r['positions']} positions across {len(r['byInstrument'])} instrument lines, "
              f"{len(r['byHolder'])} holders, longest path {r['longestPath']} hops")
        if r["byInstrument"]:
            top = max(r["byInstrument"], key=lambda l: l["pathLength"])
            print(f"    longest path: {top['explanation']}")
        print(f"    latency {ms:.0f} ms uncached, {ms_cached:.0f} ms cached")
    print()


if __name__ == "__main__":
    main()
