"""Scripted lineage and exposure queries against a running API. Prints the demo summary.

The exposure section runs a fixed grid of fund families x issuers (72 queries), prints the
three answers with the most contributing lines plus the largest answer that flows through an
issuer subsidiary, and reports latency over the whole grid.
"""

from __future__ import annotations

import json
import statistics
import sys
import time
import urllib.parse
import urllib.request

API = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"

FUND_FAMILIES = ["BLK", "IVZ", "TROW", "BEN", "STT", "AMP"]
ISSUERS = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "JPM", "XOM", "JNJ", "WMT", "PG", "UNH"]
LINEAGE = ["AAPL", "JPM", "Invesco"]


def get(path: str, **params):
    url = f"{API}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    started = time.perf_counter()
    with urllib.request.urlopen(url, timeout=60) as resp:
        body = json.load(resp)
    return body, (time.perf_counter() - started) * 1000


def first(q: str, kind: str | None = None):
    body, _ = get("/entities", q=q, limit=10)
    rows = [r for r in body if kind is None or kind in r["kinds"]]
    if not rows:
        raise SystemExit(f"no {kind or 'entity'} for {q!r}")
    return rows[0]


def subsidiary_example():
    """Find a debt-issuing subsidiary with a holder, then measure its family's exposure to the parent."""
    subs, _ = get("/entities", q="Finance Corp.", limit=40)
    best = None
    for sub in (s for s in subs if "Subsidiary" in s["kinds"]):
        trades, _ = get("/trades", entity=sub["id"], limit=1)
        if not trades:
            continue
        holder = trades[0]["holder"]
        lineage, _ = get(f"/entities/{holder['id']}/lineage")
        root = lineage["ultimateParent"]
        detail, _ = get(f"/entities/{sub['id']}")
        issuer = detail["parent"]
        r, ms = get(f"/entities/{root['id']}/exposure", issuer=issuer["id"])
        lines = [x for x in r["byInstrument"] if x["viaSubsidiary"]]
        if not lines:
            continue
        line = max(lines, key=lambda x: x["value"])
        if best is None or line["pathLength"] > best[4]["pathLength"]:
            best = (root, issuer, r, ms, line)
        if best[4]["pathLength"] >= 3:
            break
    return best


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
    print("Lineage (subsidiaryOf property paths, depth limited to 5)")
    for q in LINEAGE:
        e = first(q)
        lineage, ms = get(f"/entities/{e['id']}/lineage")
        print(f"  {e['name']}: {lineage['descendantCount']} descendants, deepest level {lineage['deepestLevel']}, "
              f"{ms:.0f} ms")
    print()
    families = [first(q, "Fund") for q in FUND_FAMILIES]
    issuers = [first(t, "Issuer") for t in ISSUERS]
    answers = []
    for fund in families:
        for issuer in issuers:
            r, ms = get(f"/entities/{fund['id']}/exposure", issuer=issuer["id"])
            answers.append((fund, issuer, r, ms))
    latencies = [a[3] for a in answers]
    top = sorted(answers, key=lambda a: (len(a[2]["byInstrument"]), a[2]["totalValue"]), reverse=True)[:3]
    print(f"Exposure (fund family to issuer, through affiliates and subsidiaries, {len(answers)} queries)")
    for fund, issuer, r, ms in top:
        print(f"  {fund['name']} -> {issuer['name']}")
        print(f"    total {money(r['totalValue'])}  direct {money(r['directValue'])}  "
              f"via subsidiaries {money(r['viaSubsidiariesValue'])}  via affiliates {money(r['viaAffiliatesValue'])}")
        print(f"    {r['positions']} positions across {len(r['byInstrument'])} instrument lines, "
              f"{len(r['byHolder'])} holders, longest path {r['longestPath']} hops, {ms:.0f} ms")
        longest = max(r["byInstrument"], key=lambda line: line["pathLength"])
        print(f"    longest path: {longest['explanation']}")
    example = subsidiary_example()
    if example:
        fund, issuer, r, ms, line = example
        print(f"  exposure through an issuer subsidiary: {fund['name']} -> {issuer['name']}")
        print(f"    {money(line['value'])} of total {money(r['totalValue'])} is issued by {line['issuerEntity']['name']}, "
              f"{line['pathLength']} hops, {ms:.0f} ms")
        print(f"    path: {line['explanation']}")
    non_zero = sum(1 for a in answers if a[2]["totalValue"] > 0)
    print(f"  {non_zero}/{len(answers)} pairs have exposure; latency p50 {statistics.median(latencies):.0f} ms, "
          f"max {max(latencies):.0f} ms (uncached, Fuseki)")
    _, cached_ms = get(f"/entities/{top[0][0]['id']}/exposure", issuer=top[0][1]["id"])
    print(f"  repeated query served from cache in {cached_ms:.0f} ms")
    print()


if __name__ == "__main__":
    main()
