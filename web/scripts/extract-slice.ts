/*
 * Extracts a deterministic slice of the committed ETL sample (etl/sample) for the
 * browser demo, plus the ontology triples and the SPARQL templates the demo quotes.
 *
 *   npx tsx scripts/extract-slice.ts
 *
 * Writes src/data/slice.json and src/data/slice-manifest.json. Both are committed;
 * this script only has to run again when the sample changes. Nothing here depends on
 * the clock or on a random source, so a rerun on the same inputs is byte identical.
 *
 * What the slice keeps:
 *   - every fund manager and sub-fund (funds.json), so a fund family is always whole;
 *   - the TOP_ISSUERS issuers by total position value, plus the issuers named by the
 *     README demo pairs and the demo grid;
 *   - every subsidiary of a kept issuer, to MAX_DEPTH levels;
 *   - every position whose holder and issuer are both kept, and the filings and
 *     instruments those positions reference.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const SAMPLE = join(REPO, 'etl', 'sample');
const OUT_DIR = join(HERE, '..', 'src', 'data');

const TOP_ISSUERS = 300;
const MAX_DEPTH = 5;

/** Issuers the README demo block names, kept regardless of their value rank. */
const REQUIRED_ISSUER_TICKERS = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'JPM', 'XOM', 'JNJ', 'WMT', 'PG', 'UNH', 'NU',
];
/** Fund families the README demo grid names. */
const REQUIRED_FUND_TICKERS = ['BLK', 'IVZ', 'TROW', 'BEN', 'STT', 'AMP', 'TPG'];

const TG = 'https://tradegraph.dev/ontology#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

type Kind = 'ISSUER' | 'FUND' | 'SUBSIDIARY';

interface RawIssuer { cik: string; ticker: string; name: string }
interface RawFund { id: string; name: string; cik: string | null; parent: string | null; jurisdiction: string | null }
interface RawSubsidiary { id: string; name: string; parent: string; jurisdiction: string | null; filing: string }
interface RawRow {
  nameOfIssuer: string;
  issuerCik?: string;
  issuerId?: string;
  ticker?: string | null;
  titleOfClass: string;
  cusip: string;
  value: number;
  sshPrnamt: number;
}
interface RawFiling {
  accessionNumber: string;
  formType: string;
  filerId: string;
  periodOfReport: string;
  infoTable: RawRow[];
}

interface Entity {
  id: string;
  name: string;
  kinds: Kind[];
  cik: string | null;
  ticker: string | null;
  parent: string | null;
  jurisdiction: string | null;
  filing: string | null;
}
interface Filing { accession: string; formType: string; filer: string; period: string }
interface Instrument { cusip: string; instrumentClass: string; ticker: string | null; issuer: string; name: string }
interface Position {
  filing: string;
  index: number;
  holder: string;
  issuer: string;
  cusip: string;
  quantity: number;
  value: number;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

/* ------------------------------------------------------------------ sample */

function readSample() {
  const issuers = readJson<RawIssuer[]>(join(SAMPLE, 'issuers.json'));
  const funds = readJson<RawFund[]>(join(SAMPLE, 'funds.json'));
  const subsidiaries = readJson<RawSubsidiary[]>(join(SAMPLE, 'subsidiaries.json'));

  const byId = new Map<string, Entity>();
  for (const r of issuers) {
    byId.set(r.cik, {
      id: r.cik, name: r.name, kinds: ['ISSUER'], cik: r.cik, ticker: r.ticker,
      parent: null, jurisdiction: null, filing: null,
    });
  }
  for (const r of funds) {
    const listed = byId.get(r.id);
    byId.set(r.id, {
      id: r.id,
      name: r.name,
      kinds: listed ? ['FUND', 'ISSUER'] : ['FUND'],
      cik: r.cik,
      ticker: listed ? listed.ticker : null,
      parent: r.parent,
      jurisdiction: r.jurisdiction,
      filing: null,
    });
  }
  for (const r of subsidiaries) {
    byId.set(r.id, {
      id: r.id, name: r.name, kinds: ['SUBSIDIARY'], cik: null, ticker: null,
      parent: r.parent, jurisdiction: r.jurisdiction, filing: r.filing,
    });
  }

  const filings = new Map<string, Filing>();
  for (const r of subsidiaries) {
    if (!filings.has(r.filing)) {
      filings.set(r.filing, {
        accession: r.filing, formType: '10-K', filer: r.filing.split('-')[0]!, period: '2023-12-31',
      });
    }
  }

  const positions: Position[] = [];
  const instruments = new Map<string, Instrument>();
  const holdingsDir = join(SAMPLE, 'holdings');
  for (const file of readdirSync(holdingsDir).sort()) {
    for (const filing of readJson<RawFiling[]>(join(holdingsDir, file))) {
      filings.set(filing.accessionNumber, {
        accession: filing.accessionNumber,
        formType: filing.formType,
        filer: filing.filerId,
        period: filing.periodOfReport,
      });
      filing.infoTable.forEach((row, index) => {
        const issuer = row.issuerCik ?? row.issuerId!;
        positions.push({
          filing: filing.accessionNumber,
          index,
          holder: filing.filerId,
          issuer,
          cusip: row.cusip,
          quantity: row.sshPrnamt,
          value: row.value,
        });
        if (!instruments.has(row.cusip)) {
          instruments.set(row.cusip, {
            cusip: row.cusip,
            instrumentClass: row.titleOfClass,
            ticker: row.ticker ?? null,
            issuer,
            name: `${row.nameOfIssuer} ${row.titleOfClass}`,
          });
        }
      });
    }
  }
  return { entities: byId, filings, positions, instruments };
}

/* ---------------------------------------------------------------- ontology */

type Term = string | { lit: string };
interface OntologyTriple { s: string; p: string; o: Term }

/**
 * Turtle reader for the subset ontology/tradegraph.ttl uses: prefix declarations,
 * subject/predicate/object statements with ';' and ',' continuations, IRIs, prefixed
 * names, 'a', and plain string literals.
 */
function parseTurtle(text: string): OntologyTriple[] {
  const prefixes = new Map<string, string>();
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '#') {
      while (i < text.length && text[i] !== '\n') i += 1;
    } else if (ch === '<') {
      const end = text.indexOf('>', i);
      tokens.push(text.slice(i, end + 1));
      i = end + 1;
    } else if (ch === '"') {
      let j = i + 1;
      let out = '"';
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\') { out += text[j]! + text[j + 1]!; j += 2; continue; }
        out += text[j]!;
        j += 1;
      }
      tokens.push(`${out}"`);
      i = j + 1;
    } else if (ch === ';' || ch === ',' || ch === '.') {
      // '.' only terminates a statement when it stands alone.
      const next = text[i + 1] ?? ' ';
      if (ch !== '.' || /[\s]/.test(next)) { tokens.push(ch); i += 1; } else { i += 1; }
    } else if (/\s/.test(ch)) {
      i += 1;
    } else {
      let j = i;
      while (j < text.length && !/[\s;,]/.test(text[j]!) && !(text[j] === '.' && /\s/.test(text[j + 1] ?? ' '))) j += 1;
      tokens.push(text.slice(i, j));
      i = j;
    }
  }

  const expand = (token: string): Term => {
    if (token.startsWith('"')) return { lit: token.slice(1, -1) };
    if (token.startsWith('<')) return token.slice(1, -1);
    if (token === 'a') return RDF_TYPE;
    const colon = token.indexOf(':');
    const base = prefixes.get(token.slice(0, colon)) ?? '';
    return base + token.slice(colon + 1);
  };

  const triples: OntologyTriple[] = [];
  let subject: string | null = null;
  let predicate: string | null = null;
  let cursor = 0;
  while (cursor < tokens.length) {
    const token = tokens[cursor]!;
    if (token === '@prefix') {
      prefixes.set(tokens[cursor + 1]!.replace(':', ''), tokens[cursor + 2]!.slice(1, -1));
      cursor += 4;
      continue;
    }
    if (token === '.') { subject = null; predicate = null; cursor += 1; continue; }
    if (token === ';') { predicate = null; cursor += 1; continue; }
    if (token === ',') { cursor += 1; continue; }
    if (subject === null) { subject = expand(token) as string; cursor += 1; continue; }
    if (predicate === null) { predicate = expand(token) as string; cursor += 1; continue; }
    triples.push({ s: subject, p: predicate, o: expand(token) });
    cursor += 1;
    // A following ',' repeats subject and predicate; ';' repeats the subject only.
    if (tokens[cursor] === ',') cursor += 1;
  }
  return triples;
}

/* ------------------------------------------------------------------- slice */

function descendants(childrenOf: Map<string, string[]>, root: string, depth: number): string[] {
  const seen = new Set<string>();
  let frontier = [root];
  for (let level = 0; level < depth && frontier.length > 0; level += 1) {
    const next: string[] = [];
    for (const parent of frontier) {
      for (const child of childrenOf.get(parent) ?? []) {
        if (!seen.has(child)) { seen.add(child); next.push(child); }
      }
    }
    frontier = next;
  }
  return [...seen];
}

function countTriples(
  entities: Iterable<Entity>,
  filings: Iterable<Filing>,
  positions: Position[],
  instruments: Iterable<Instrument>,
  ontologyTriples: number,
): number {
  let total = ontologyTriples;
  for (const e of entities) {
    const classes = new Set<string>(['LegalEntity']);
    for (const kind of e.kinds) {
      classes.add(kind === 'ISSUER' ? 'Issuer' : kind === 'FUND' ? 'Fund' : 'Subsidiary');
      if (kind !== 'SUBSIDIARY') classes.add('Counterparty');
    }
    total += classes.size + 1;
    if (e.cik) total += 1;
    if (e.ticker) total += 1;
    if (e.jurisdiction) total += 1;
    if (e.parent) total += 2;
    if (e.filing) total += 1;
  }
  for (const _f of filings) total += 5;
  total += positions.length * 9;
  for (const inst of instruments) total += inst.ticker ? 6 : 5;
  const counterparties = new Set<string>();
  for (const p of positions) counterparties.add(`${p.holder}>${p.issuer}`);
  return total + counterparties.size * 2;
}

function main(): void {
  const sample = readSample();
  const ontologyTriples = parseTurtle(readFileSync(join(REPO, 'ontology', 'tradegraph.ttl'), 'utf8'));

  const childrenOf = new Map<string, string[]>();
  for (const e of sample.entities.values()) {
    if (!e.parent) continue;
    const list = childrenOf.get(e.parent);
    if (list) list.push(e.id); else childrenOf.set(e.parent, [e.id]);
  }

  const valueByIssuer = new Map<string, number>();
  for (const p of sample.positions) {
    valueByIssuer.set(p.issuer, (valueByIssuer.get(p.issuer) ?? 0) + p.value);
  }
  const ranked = [...valueByIssuer.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1))
    .map(([id]) => id);

  const byTicker = new Map<string, string>();
  for (const e of sample.entities.values()) {
    if (e.ticker && !byTicker.has(e.ticker)) byTicker.set(e.ticker, e.id);
  }

  const keptIssuers = new Set(ranked.slice(0, TOP_ISSUERS));
  for (const ticker of REQUIRED_ISSUER_TICKERS) {
    const id = byTicker.get(ticker);
    if (!id) throw new Error(`sample has no issuer with ticker ${ticker}`);
    keptIssuers.add(id);
  }
  for (const ticker of REQUIRED_FUND_TICKERS) {
    if (!byTicker.has(ticker)) throw new Error(`sample has no fund family with ticker ${ticker}`);
  }

  const kept = new Set<string>();
  for (const e of sample.entities.values()) {
    if (e.kinds.includes('FUND')) kept.add(e.id);
  }
  for (const id of keptIssuers) {
    kept.add(id);
    for (const child of descendants(childrenOf, id, MAX_DEPTH)) kept.add(child);
  }
  // Sub-funds and fund families never dangle: keep every ancestor of a kept entity.
  for (const id of [...kept]) {
    let cursor = sample.entities.get(id)?.parent ?? null;
    for (let level = 0; level < MAX_DEPTH && cursor; level += 1) {
      kept.add(cursor);
      cursor = sample.entities.get(cursor)?.parent ?? null;
    }
  }

  const positions = sample.positions.filter((p) => kept.has(p.holder) && kept.has(p.issuer));
  const filingIds = new Set(positions.map((p) => p.filing));
  for (const id of kept) {
    const filing = sample.entities.get(id)?.filing;
    if (filing) filingIds.add(filing);
  }
  const cusips = new Set(positions.map((p) => p.cusip));

  const entities = [...sample.entities.values()]
    .filter((e) => kept.has(e.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const filings = [...sample.filings.values()]
    .filter((f) => filingIds.has(f.accession))
    .sort((a, b) => (a.accession < b.accession ? -1 : 1));
  const instruments = [...sample.instruments.values()]
    .filter((inst) => cusips.has(inst.cusip))
    .sort((a, b) => (a.cusip < b.cusip ? -1 : 1));

  const entityIndex = new Map(entities.map((e, i) => [e.id, i]));
  const filingIndex = new Map(filings.map((f, i) => [f.accession, i]));
  const instrumentIndex = new Map(instruments.map((inst, i) => [inst.cusip, i]));

  const KIND_BIT: Record<Kind, number> = { ISSUER: 1, FUND: 2, SUBSIDIARY: 4 };

  const slice = {
    meta: {
      source: 'etl/sample',
      generator: 'web/scripts/extract-slice.ts',
      topIssuers: TOP_ISSUERS,
      maxDepth: MAX_DEPTH,
      // Counts for the whole sample, recomputed here with the same rules the ETL uses,
      // so the demo can say plainly how much of it the slice carries.
      full: {
        entities: sample.entities.size,
        issuers: [...sample.entities.values()].filter((e) => e.kinds.includes('ISSUER')).length,
        funds: [...sample.entities.values()].filter((e) => e.kinds.includes('FUND')).length,
        subsidiaries: [...sample.entities.values()].filter((e) => e.kinds.includes('SUBSIDIARY')).length,
        positions: sample.positions.length,
        filings: sample.filings.size,
        lineageEdges: [...sample.entities.values()].filter((e) => e.parent).length,
        triples: countTriples(
          sample.entities.values(), sample.filings.values(), sample.positions,
          sample.instruments.values(), ontologyTriples.length,
        ),
      },
    },
    // [id, name, kindBits, ticker, cik, parentIndex, jurisdiction, filingIndex]
    entities: entities.map((e) => [
      e.id,
      e.name,
      e.kinds.reduce((bits, kind) => bits | KIND_BIT[kind], 0),
      e.ticker,
      e.cik,
      e.parent !== null && entityIndex.has(e.parent) ? entityIndex.get(e.parent)! : -1,
      e.jurisdiction,
      e.filing !== null && filingIndex.has(e.filing) ? filingIndex.get(e.filing)! : -1,
    ]),
    // [accession, formType, filerIndex, period]
    filings: filings.map((f) => [
      f.accession, f.formType, entityIndex.get(f.filer) ?? -1, f.period,
    ]),
    // [cusip, instrumentClass, ticker, issuerIndex, name]
    instruments: instruments.map((inst) => [
      inst.cusip, inst.instrumentClass, inst.ticker, entityIndex.get(inst.issuer) ?? -1, inst.name,
    ]),
    // [filingIndex, indexInFiling, holderIndex, issuerIndex, instrumentIndex, quantity, value]
    positions: positions.map((p) => [
      filingIndex.get(p.filing)!,
      p.index,
      entityIndex.get(p.holder)!,
      entityIndex.get(p.issuer)!,
      instrumentIndex.get(p.cusip)!,
      p.quantity,
      p.value,
    ]),
    // The ontology graph, verbatim from ontology/tradegraph.ttl.
    ontology: ontologyTriples.map((t) => [
      t.s, t.p, typeof t.o === 'string' ? t.o : t.o.lit, typeof t.o === 'string' ? 0 : 1,
    ]),
    // The SPARQL the API sends, quoted next to the in-browser equivalent.
    queries: Object.fromEntries(
      ['prefixes', 'exposure', 'lineage_up', 'lineage_down', 'neighbors', 'search', 'stats']
        .map((name) => [
          name,
          readFileSync(join(REPO, 'api', 'src', 'main', 'resources', 'queries', `${name}.rq`), 'utf8').trimEnd(),
        ]),
    ),
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const slicePath = join(OUT_DIR, 'slice.json');
  const json = `${JSON.stringify(slice)}\n`;
  writeFileSync(slicePath, json);

  const sha256 = createHash('sha256').update(json).digest('hex');
  const sliceTriples = countTriples(entities, filings, positions, instruments, ontologyTriples.length);
  const manifest = {
    file: 'slice.json',
    sha256,
    bytes: statSync(slicePath).size,
    source: 'etl/sample',
    topIssuers: TOP_ISSUERS,
    maxDepth: MAX_DEPTH,
    counts: {
      entities: entities.length,
      issuers: entities.filter((e) => e.kinds.includes('ISSUER')).length,
      funds: entities.filter((e) => e.kinds.includes('FUND')).length,
      subsidiaries: entities.filter((e) => e.kinds.includes('SUBSIDIARY')).length,
      positions: positions.length,
      filings: filings.length,
      instruments: instruments.length,
      lineageEdges: entities.filter((e) => e.parent !== null && entityIndex.has(e.parent)).length,
      ontologyTriples: ontologyTriples.length,
      triples: sliceTriples,
    },
    full: slice.meta.full,
  };
  writeFileSync(join(OUT_DIR, 'slice-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  process.stdout.write(`slice.json ${(manifest.bytes / 1024).toFixed(0)} KiB sha256 ${sha256.slice(0, 16)}\n`);
  process.stdout.write(
    `entities ${manifest.counts.entities} positions ${manifest.counts.positions} `
    + `filings ${manifest.counts.filings} instruments ${manifest.counts.instruments} `
    + `triples ${manifest.counts.triples} (full sample ${manifest.full.triples})\n`,
  );
}

main();
