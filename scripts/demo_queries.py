"""Scripted lineage and exposure queries against a running API. Prints the demo summary.

The exposure section runs a fixed grid of fund families x issuers (72 queries), prints the
three answers with the most contributing lines plus the largest answer that flows through an
issuer subsidiary, and reports latency over the whole grid.

With ``--summary PATH`` the same measurements are written to PATH as JSON, with the commit
and host that produced them. That file is the one source for the figures quoted in README.md
and in the browser demo, so a quoted number cannot fall behind the run it came from.
"""

from __future__ import annotations

import json
import os
import platform
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ARGS = sys.argv[1:]
SUMMARY_PATH: str | None = None
if "--summary" in ARGS:
    _at = ARGS.index("--summary")
    SUMMARY_PATH = ARGS[_at + 1]
    ARGS = ARGS[:_at] + ARGS[_at + 2 :]
API = ARGS[0] if ARGS else "http://localhost:8080"

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


def commit() -> str:
    """Short sha of the checkout the measurement ran against, or "unknown"."""
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return "unknown"
    return out.stdout.strip()


def provenance() -> dict:
    return {
        "measuredAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "commit": commit(),
        "host": f"{platform.system().lower()} {platform.machine()}, {os.cpu_count()} cores",
        "python": platform.python_version(),
    }


def write_summary(path: str, store: str, endpoint: str, stats: dict, stats_ms: float,
                  answers: list, top: list, latencies: list[float], non_zero: int,
                  cached_ms: float) -> None:
    """Every figure here was returned by the API in this run; nothing is carried over."""
    summary = {
        "generator": "scripts/demo_queries.py",
        "provenance": provenance(),
        "store": store,
        "endpoint": endpoint,
        "dataset": {
            "entities": stats["entities"],
            "issuers": stats["issuers"],
            "funds": stats["funds"],
            "subsidiaries": stats["subsidiaries"],
            "positions": stats["positions"],
            "filings": stats["filings"],
            "lineageEdges": stats["lineageEdges"],
            "triples": stats["triples"],
        },
        "statsQueryMillis": round(stats_ms),
        "exposure": {
            "queries": len(answers),
            "pairsWithExposure": non_zero,
            "p50Millis": round(statistics.median(latencies)),
            "maxMillis": round(max(latencies)),
            "cachedRepeatMillis": round(cached_ms),
        },
        "topPairs": [
            {
                "fund": fund["name"],
                "issuer": issuer["name"],
                "totalValue": r["totalValue"],
                "millis": round(ms),
            }
            for fund, issuer, r, ms in top
        ],
    }
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(summary, indent=2) + "\n")
    print(f"  summary written to {path}")


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
    if SUMMARY_PATH:
        write_summary(SUMMARY_PATH, stats["store"],
                      health["components"]["store"]["details"]["queryUrl"], stats, stats_ms,
                      answers, top, latencies, non_zero, cached_ms)
    print()
    operations()


def operations() -> None:
    ops, _ = get("/ops/overview")
    cache = ops["cache"]
    quality = ops.get("quality")
    print("Operations (/ops/overview)")
    print(f"  store          : {ops['store']} reasoning={str(ops['reasoning']).lower()}, "
          f"{ops['triples']:,} triples, exposure depth <= {ops['exposureMaxDepth']}, "
          f"lineage depth <= {ops['lineageMaxDepth']}")
    print(f"  cache          : {cache['hits']:,} hits, {cache['misses']:,} misses, "
          f"hit ratio {cache['hitRatio']:.2f}, {cache['entries']:,} entries across {cache['caches']} caches")
    slowest = ", ".join(f"{q['template']} {q['millis']} ms" for q in ops["slowestQueries"])
    print(f"  slowest queries: {slowest}")
    if quality:
        print(f"  data quality   : conforms={str(quality['conforms']).lower()}, "
              f"dangling {quality['danglingReferences']}, cycles {quality['subsidiaryCycles']}, "
              f"missing identifiers {quality['missingIdentifiers']}, "
              f"shape violations {quality['shaclViolations']} (checked {quality['checkedAt']})")
    guard, code = cost_guard()
    print(f"  cost guard     : depth={guard} answered {code}")
    print()


def cost_guard() -> tuple[int, int]:
    """Ask for more depth than the API allows and report the status it answers with."""
    depth = 9
    url = f"{API}/entities/0000320193/lineage?depth={depth}"
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            return depth, resp.status
    except urllib.error.HTTPError as e:
        return depth, e.code


if __name__ == "__main__":
    main()
