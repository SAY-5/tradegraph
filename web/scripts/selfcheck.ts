/*
 * Self check for the browser demo: runs the in-browser query functions in node and
 * compares them against the numbers the README's `make demo` block reports, against the
 * committed manifest, and against themselves (determinism, depth caps, cache identity).
 *
 *   npm run selfcheck
 *
 * Exits non zero on the first failing group, after printing every result.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GraphApi, boundedPath, clampDepth, mergeGraphs, sliceManifest } from '../src/graph/index';
import { RDF_TYPE } from '../src/graph/store';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '..');

let checks = 0;
let failures = 0;

function ok(label: string, condition: boolean, detail = ''): void {
  checks += 1;
  if (condition) {
    process.stdout.write(`  ok   ${label}${detail ? ` (${detail})` : ''}\n`);
  } else {
    failures += 1;
    process.stdout.write(`  FAIL ${label}${detail ? ` (${detail})` : ''}\n`);
  }
}

function eq(label: string, actual: unknown, expected: unknown): void {
  ok(label, Object.is(actual, expected), `expected ${String(expected)}, got ${String(actual)}`);
}

function group(name: string): void {
  process.stdout.write(`\n${name}\n`);
}

const api = new GraphApi();
const store = api.store;
const id = (ticker: string): string => {
  const match = [...store.entities.values()].find((e) => e.ticker === ticker);
  if (!match) throw new Error(`no entity with ticker ${ticker}`);
  return match.id;
};

const TROW = id('TROW');
const BLK = id('BLK');
const IVZ = id('IVZ');
const TPG = id('TPG');
const AAPL = id('AAPL');
const META = id('META');
const NU = id('NU');
const JPM = id('JPM');

/* ------------------------------------------------------------------ slice */

group('slice integrity');
const sliceBytes = readFileSync(join(WEB, 'src', 'data', 'slice.json'));
const sha256 = createHash('sha256').update(sliceBytes).digest('hex');
eq('slice.json sha256 matches the manifest', sha256, sliceManifest.sha256);
eq('slice.json byte count matches the manifest', sliceBytes.length, sliceManifest.bytes);
ok('slice.json stays under 1.5 MB', sliceBytes.length < 1_500_000, `${(sliceBytes.length / 1024).toFixed(0)} KiB`);

group('store rebuilds the slice into triples');
const stats = api.stats().value;
eq('triples materialised', stats.triples, sliceManifest.counts.triples);
eq('entities', stats.entities, sliceManifest.counts.entities);
eq('positions', stats.positions, sliceManifest.counts.positions);
eq('filings', stats.filings, sliceManifest.counts.filings);
eq('lineage edges', stats.lineageEdges, sliceManifest.counts.lineageEdges);
eq('every fund family and sub-fund is present', stats.funds, sliceManifest.full.funds);
eq(
  'ontology classes carried over from tradegraph.ttl',
  store.match(undefined, RDF_TYPE, 'http://www.w3.org/2002/07/owl#Class').length,
  9,
);

/* --------------------------------------------------------------- exposure */

group('README exposure pairs reproduce exactly');
const trowApple = api.exposure(TROW, AAPL).value;
const blkMeta = api.exposure(BLK, META).value;
const ivzApple = api.exposure(IVZ, AAPL).value;
const tpgNu = api.exposure(TPG, NU).value;

eq('T. Rowe Price to Apple', Math.round(trowApple.totalValue), 2_475_300_433);
eq('BlackRock to Meta', Math.round(blkMeta.totalValue), 1_980_265_856);
eq('Invesco to Apple', Math.round(ivzApple.totalValue), 1_523_775_489);
eq('TPG to Nu Holdings', Math.round(tpgNu.totalValue), 4_792_566);

const longest = (r: typeof trowApple) => r.byInstrument.reduce(
  (best, line) => (line.pathLength > best.pathLength ? line : best),
  r.byInstrument[0],
);
eq(
  'T. Rowe Price explanation sentence',
  longest(trowApple).explanation,
  'PRICE T ROWE GROUP INC, whose subsidiary Price T ROWE Global Select Fund holds COMMON AAPL issued by Apple Inc.',
);
eq(
  'BlackRock explanation sentence',
  longest(blkMeta).explanation,
  'BlackRock, Inc., whose subsidiary Blackrock International Value Fund holds PUT META issued by Meta Platforms, Inc.',
);
eq(
  'Invesco explanation sentence',
  longest(ivzApple).explanation,
  'Invesco Ltd., whose subsidiary Invesco Dividend Focus Fund holds COMMON AAPL issued by Apple Inc.',
);
eq(
  'TPG explanation sentence crosses the issuer subsidiary',
  tpgNu.byInstrument[0].explanation,
  'TPG Inc., whose subsidiary TPG Global Select Fund holds DEBT issued by Nu Finance Corp. is a subsidiary of Nu Holdings Ltd.',
);
eq('TPG to Nu Holdings is three hops', tpgNu.byInstrument[0].pathLength, 3);
eq('TPG line is issued by the finance subsidiary', tpgNu.byInstrument[0].issuerEntity.name, 'Nu Finance Corp.');
eq('T. Rowe Price answer has three instrument lines', trowApple.byInstrument.length, 3);
eq('T. Rowe Price answer has three holders', trowApple.byHolder.length, 3);
eq('T. Rowe Price longest path is two hops', trowApple.longestPath, 2);

group('legs partition the total, the affiliate leg does not double count');
for (const [label, answer] of [
  ['T. Rowe Price to Apple', trowApple],
  ['BlackRock to Meta', blkMeta],
  ['Invesco to Apple', ivzApple],
  ['TPG to Nu Holdings', tpgNu],
] as const) {
  const legs = answer.directValue + answer.viaSubsidiariesValue + answer.viaAffiliatesValue;
  ok(`${label}: direct + via subsidiaries + via affiliates equals the total`,
    Math.abs(legs - answer.totalValue) < 1e-6,
    `${Math.round(legs)} vs ${Math.round(answer.totalValue)}`);
}
const trowAlone = api.exposure(TROW, AAPL, { includeAffiliates: false }).value;
eq('with affiliates off the affiliate leg is zero', trowAlone.viaAffiliatesValue, 0);
ok('with affiliates off the answer shrinks to what the filer itself holds',
  trowAlone.totalValue < trowApple.totalValue,
  `${Math.round(trowAlone.totalValue)} vs ${Math.round(trowApple.totalValue)}`);

const tpgNoSubs = api.exposure(TPG, NU, { includeSubsidiaries: false }).value;
eq('with subsidiaries off the Nu Finance leg is gone', tpgNoSubs.byInstrument.length, 0);
eq('with subsidiaries off the total is zero', tpgNoSubs.totalValue, 0);
ok('the Nu Finance leg is the whole of the TPG answer',
  tpgNu.byInstrument.every((line) => line.viaSubsidiary),
  `${tpgNu.byInstrument.length} line(s)`);

/* ------------------------------------------------------------------ depth */

group('depth cap');
eq('clampDepth refuses more than five', clampDepth(9), 5);
eq('clampDepth refuses less than one', clampDepth(0), 1);
eq('exposure reports the capped depth', api.exposure(TPG, NU, { depth: 12 }).value.maxDepth, 5);
eq('a depth of one drops the issuer subsidiary leg',
  api.exposure(TPG, NU, { depth: 1 }).value.byInstrument.length, 1);
eq('bounded path expansion matches SparqlPaths.bounded',
  boundedPath('tg:subsidiaryOf', 1, 3),
  '(tg:subsidiaryOf|tg:subsidiaryOf/tg:subsidiaryOf|tg:subsidiaryOf/tg:subsidiaryOf/tg:subsidiaryOf)');

group('lineage matches the README demo');
const apple = api.lineage(AAPL).value;
eq('Apple descendants', apple.descendantCount, 6);
eq('Apple deepest level', apple.deepestLevel, 2);
const jpm = api.lineage(JPM).value;
eq('JPMorgan descendants', jpm.descendantCount, 7);
eq('JPMorgan deepest level', jpm.deepestLevel, 1);
const invesco = api.lineage(IVZ).value;
eq('Invesco descendants', invesco.descendantCount, 7);
eq('Invesco deepest level', invesco.deepestLevel, 1);
ok('a depth of one stops the tree at the first level',
  api.lineage(AAPL, 1).value.deepestLevel <= 1,
  `deepest ${api.lineage(AAPL, 1).value.deepestLevel}`);

/* ------------------------------------------------------------------ cache */

group('cache');
const fresh = new GraphApi();
const miss = fresh.exposure(TROW, AAPL);
const hit = fresh.exposure(TROW, AAPL);
ok('the first call is a miss', !miss.cacheHit);
ok('the repeated call is a hit', hit.cacheHit);
ok('the repeated call returns the identical object', Object.is(miss.value, hit.value));
eq('miss counter', fresh.cache.misses, 1);
eq('hit counter', fresh.cache.hits, 1);
ok('a different option set is a different key', !fresh.exposure(TROW, AAPL, { depth: 2 }).cacheHit);

/* --------------------------------------------------- search and neighbours */

group('search and neighbours');
const found = api.search('AAPL').value;
eq('a ticker search puts the issuer first', found[0].name, 'Apple Inc.');
ok('a name search finds the fund family',
  api.search('Invesco').value.some((row) => row.id === IVZ),
  `${api.search('Invesco').value.length} rows`);
let rejected = false;
try {
  api.search('a');
} catch {
  rejected = true;
}
ok('a one character query is rejected', rejected);
const appleNeighbors = api.neighbors(AAPL, 40).value;
ok('Apple has neighbours in both directions',
  appleNeighbors.links.some((l) => l.rel === 'holds') && appleNeighbors.links.some((l) => l.rel === 'subsidiaryOf'),
  `${appleNeighbors.links.length} links`);
const merged = mergeGraphs(appleNeighbors, api.neighbors(TROW, 40).value);
ok('merging an expansion keeps the original centre', merged.center === appleNeighbors.center);
ok('merging is additive and deduplicated',
  merged.nodes.length > appleNeighbors.nodes.length
  && mergeGraphs(merged, appleNeighbors).links.length === merged.links.length,
  `${merged.nodes.length} nodes`);

/* --------------------------------------------------------- the demo grid */

group('the README demo grid');
const families = ['BLK', 'IVZ', 'TROW', 'BEN', 'STT', 'AMP'].map(id);
const issuers = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'JPM', 'XOM', 'JNJ', 'WMT', 'PG', 'UNH'].map(id);
const grid = families.flatMap((fund) => issuers.map((issuer) => api.exposure(fund, issuer).value));
eq('the grid is 72 queries', grid.length, 72);
eq('pairs with exposure', grid.filter((answer) => answer.totalValue > 0).length, 26);
const second = new GraphApi();
const repeated = families.flatMap((fund) => issuers.map((issuer) => second.exposure(fund, issuer).value));
ok('a second store gives the same totals',
  grid.every((answer, i) => answer.totalValue === repeated[i].totalValue));

group('no non-deterministic sources in the query layer');
for (const file of ['store.ts', 'queries.ts', 'cache.ts', 'index.ts', 'types.ts']) {
  const text = readFileSync(join(WEB, 'src', 'graph', file), 'utf8');
  ok(`graph/${file} has no random or eval`,
    !/Math\.random|\beval\s*\(|new Function\s*\(/.test(text));
}

process.stdout.write(`\n${checks - failures}/${checks} checks passed\n`);
if (failures > 0) process.exit(1);
