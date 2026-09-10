import { useEffect, useRef, useState } from 'react';

import { GraphApi, sliceManifest } from '../graph';
import type { ExposureLine, ExposureResponse } from '../graph';
import { count, money } from '../lib/format';

/*
 * scripts/demo_queries.py, ported to the slice.
 *
 * Same grid (6 fund families x 12 issuers), same choice of the three answers to print,
 * same hunt for an exposure that flows through an issuer subsidiary, same summary lines.
 * The milliseconds are measured here, in this browser, against the in-memory store; the
 * README's are from the Spring Boot API against Fuseki, so they are not comparable, only
 * the answers are.
 */

const FUND_FAMILIES = ['BLK', 'IVZ', 'TROW', 'BEN', 'STT', 'AMP'];
const ISSUERS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'JPM', 'XOM', 'JNJ', 'WMT', 'PG', 'UNH'];
const LINEAGE = ['AAPL', 'JPM', 'Invesco'];

const LABEL_WIDTH = 17;

function label(text: string): string {
  return text.padEnd(LABEL_WIDTH, ' ');
}

function ms(value: number): string {
  return `${value.toFixed(0)} ms`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function runDemo(api: GraphApi): string {
  api.cache.clear();
  const store = api.store;
  const out: string[] = [];

  const first = (query: string, kind?: 'Fund' | 'Issuer') => {
    const rows = api.search(query, 10).value.filter((row) => kind === undefined || row.kinds.includes(kind));
    if (rows.length === 0) throw new Error(`no ${kind ?? 'entity'} for ${query}`);
    return rows[0];
  };

  const statsCall = api.stats();
  const stats = statsCall.value;
  out.push('TradeGraph demo summary');
  out.push('=======================');
  out.push(`${label('store')}: browser slice of ${sliceManifest.source} (in-memory triple store)`);
  out.push(`${label('entities loaded')}: ${count(stats.entities)} (issuers ${count(stats.issuers)}, `
    + `funds ${count(stats.funds)}, subsidiaries ${count(stats.subsidiaries)})`);
  out.push(`${label('positions')}: ${count(stats.positions)} in ${count(stats.filings)} filings`);
  out.push(`${label('lineage edges')}: ${count(stats.lineageEdges)}`);
  out.push(`${label('triples')}: ${count(stats.triples)}`);
  out.push(`${label('stats query')}: ${ms(statsCall.millis)}`);
  out.push('');

  out.push('Lineage (subsidiaryOf property paths, depth limited to 5)');
  for (const query of LINEAGE) {
    const entity = first(query);
    const call = api.lineage(entity.id);
    out.push(`  ${entity.name}: ${call.value.descendantCount} descendants, `
      + `deepest level ${call.value.deepestLevel}, ${ms(call.millis)}`);
  }
  out.push('');

  const families = FUND_FAMILIES.map((ticker) => first(ticker, 'Fund'));
  const issuers = ISSUERS.map((ticker) => first(ticker, 'Issuer'));
  const answers: { fund: string; issuer: string; result: ExposureResponse; millis: number }[] = [];
  for (const fund of families) {
    for (const issuer of issuers) {
      const call = api.exposure(fund.id, issuer.id);
      answers.push({ fund: fund.name, issuer: issuer.name, result: call.value, millis: call.millis });
    }
  }
  const latencies = answers.map((answer) => answer.millis);
  const top = [...answers].sort((a, b) => (b.result.byInstrument.length - a.result.byInstrument.length)
    || (b.result.totalValue - a.result.totalValue)).slice(0, 3);

  out.push(`Exposure (fund family to issuer, through affiliates and subsidiaries, ${answers.length} queries)`);
  for (const answer of top) {
    const r = answer.result;
    out.push(`  ${answer.fund} -> ${answer.issuer}`);
    out.push(`    total ${money(r.totalValue)}  direct ${money(r.directValue)}  `
      + `via subsidiaries ${money(r.viaSubsidiariesValue)}  via affiliates ${money(r.viaAffiliatesValue)}`);
    out.push(`    ${r.positions} positions across ${r.byInstrument.length} instrument lines, `
      + `${r.byHolder.length} holders, longest path ${r.longestPath} hops, ${ms(answer.millis)}`);
    const longest = r.byInstrument.reduce(
      (best, line) => (line.pathLength > best.pathLength ? line : best),
      r.byInstrument[0],
    );
    out.push(`    longest path: ${longest.explanation}`);
  }

  // The same hunt demo_queries.py does: a debt issuing subsidiary that somebody holds.
  let best: { fund: string; issuer: string; result: ExposureResponse; millis: number; line: ExposureLine } | null = null;
  for (const sub of api.search('Finance Corp.', 40).value.filter((row) => row.kinds.includes('Subsidiary'))) {
    const positions = api.trades(sub.id, 1).value;
    if (positions.length === 0) continue;
    const holder = positions[0].holder;
    const root = api.lineage(holder.id).value.ultimateParent;
    const parent = store.entity(sub.id)?.parent;
    if (!parent) continue;
    const call = api.exposure(root.id, parent);
    const viaSubsidiary = call.value.byInstrument.filter((line) => line.viaSubsidiary);
    if (viaSubsidiary.length === 0) continue;
    const line = viaSubsidiary.reduce((a, b) => (b.value > a.value ? b : a));
    if (best === null || line.pathLength > best.line.pathLength) {
      best = {
        fund: root.name,
        issuer: store.entity(parent)?.name ?? parent,
        result: call.value,
        millis: call.millis,
        line,
      };
    }
    if (best.line.pathLength >= 3) break;
  }
  if (best) {
    out.push(`  exposure through an issuer subsidiary: ${best.fund} -> ${best.issuer}`);
    out.push(`    ${money(best.line.value)} of total ${money(best.result.totalValue)} is issued by `
      + `${best.line.issuerEntity.name}, ${best.line.pathLength} hops, ${ms(best.millis)}`);
    out.push(`    path: ${best.line.explanation}`);
  }

  const nonZero = answers.filter((answer) => answer.result.totalValue > 0).length;
  out.push(`  ${nonZero}/${answers.length} pairs have exposure; latency p50 ${ms(median(latencies))}, `
    + `max ${ms(Math.max(...latencies))} (uncached, in-browser)`);
  const topPair = top[0];
  const topFund = families.find((family) => family.name === topPair.fund) ?? families[0];
  const topIssuer = issuers.find((issuer) => issuer.name === topPair.issuer) ?? issuers[0];
  const cached = api.exposure(topFund.id, topIssuer.id);
  out.push(`  repeated query served from cache in ${cached.millis.toFixed(2)} ms `
    + `(cache ${api.cache.hits} hits, ${api.cache.misses} misses)`);
  out.push('');
  return out.join('\n');
}

export function FullRun() {
  const api = useRef<GraphApi | null>(null);
  const [output, setOutput] = useState('');
  const [elapsed, setElapsed] = useState(0);

  const run = (): void => {
    if (api.current === null) api.current = new GraphApi();
    const started = performance.now();
    const text = runDemo(api.current);
    setElapsed(performance.now() - started);
    setOutput(text);
  };

  useEffect(() => { run(); }, []);

  return (
    <section className="section" id="run" aria-labelledby="run-title">
      <div className="shell">
        <p className="eyebrow">05 / full run</p>
        <h2 id="run-title">The README demo block, recomputed here</h2>
        <p className="section__lede">
          {'This is '}
          <code>scripts/demo_queries.py</code>
          {' ported to the slice: the same 72 pair grid, the same three answers picked to '}
          {'print, the same hunt for exposure that reaches the issuer through one of its own '}
          {'subsidiaries. The dollar figures match the README exactly. The milliseconds do not '}
          {'and should not: the README times a Spring Boot API talking to Fuseki over HTTP, '}
          {'this times function calls over an in-memory store.'}
        </p>

        <div className="stat-row">
          <button type="button" className="btn btn--primary" onClick={run}>run again</button>
          <span className="badge" aria-live="polite">{`whole run ${elapsed.toFixed(0)} ms`}</span>
        </div>

        <pre id="demo-block" style={{ marginTop: 16 }} tabIndex={0} aria-label="demo summary output">
          {output || 'running...'}
        </pre>
      </div>
    </section>
  );
}
