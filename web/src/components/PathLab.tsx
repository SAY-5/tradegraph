import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import queriesSource from '../graph/queries.ts?raw';
import { boundedPath, graph, SUBSIDIARY_OF } from '../graph';
import { renderExposure, renderLineageDown, renderLineageUp, renderNeighbors } from '../graph/sparql';
import { count } from '../lib/format';

/*
 * The property path lab: the SPARQL the API would send for this entity and depth, beside
 * the function in this page that answers it, with the bounded path stepped one alternative
 * at a time. The TypeScript is read out of src/graph/queries.ts at load, so it cannot drift
 * from the code that produced the numbers elsewhere on the page.
 */

type QueryKey = 'lineage_down' | 'lineage_up' | 'exposure' | 'neighbors';

const QUERIES: { key: QueryKey; file: string; fn: string; blurb: string }[] = [
  {
    key: 'lineage_down',
    file: 'lineage_down.rq',
    fn: 'descendantIds',
    blurb: 'Every child edge reachable within the depth budget; the tree is ordered afterwards.',
  },
  {
    key: 'lineage_up',
    file: 'lineage_up.rq',
    fn: 'ancestors',
    blurb: 'The parent edges above an entity, walked into a chain nearest first.',
  },
  {
    key: 'exposure',
    file: 'exposure.rq',
    fn: 'exposure',
    blurb: 'One aggregate query with two generated clauses: the holder family and the issuing entities.',
  },
  {
    key: 'neighbors',
    file: 'neighbors.rq',
    fn: 'neighbors',
    blurb: 'Four subqueries unioned: parent, subsidiaries, strongest holdings, strongest holders.',
  },
];

const SUBJECTS = [
  { id: '0000320193', label: 'Apple Inc.' },
  { id: '0001691493', label: 'Nu Holdings Ltd.' },
  { id: '0001113169', label: 'PRICE T ROWE GROUP INC' },
  { id: '0001880661', label: 'TPG Inc.' },
  { id: '0000019617', label: 'JPMORGAN CHASE & CO' },
];

/** Pulls one function out of the real source file so the panel cannot go stale. */
function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`export function ${name}(`);
  const at = start >= 0 ? start : source.indexOf(`function ${name}(`);
  if (at < 0) return `// ${name} not found in src/graph/queries.ts`;
  const end = source.indexOf('\n}\n', at);
  return source.slice(at, end < 0 ? source.length : end + 2);
}

/** Wraps the nth alternative of a bounded path in a <mark> wherever the path appears. */
function highlightAlternative(text: string, path: string, step: number): ReactNode[] {
  if (path === '' || !text.includes(path)) return [text];
  const alternatives = path.slice(1, -1).split('|');
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (;;) {
    const at = text.indexOf(path, cursor);
    if (at < 0) {
      nodes.push(text.slice(cursor));
      break;
    }
    nodes.push(text.slice(cursor, at));
    nodes.push('(');
    alternatives.forEach((alternative, index) => {
      if (index > 0) nodes.push('|');
      key += 1;
      nodes.push(index === step
        ? <mark key={`m${key}`}>{alternative}</mark>
        : <span key={`s${key}`} style={{ opacity: 0.45 }}>{alternative}</span>);
    });
    nodes.push(')');
    cursor = at + path.length;
  }
  return nodes;
}

function levels(rootId: string, depth: number): { level: number; ids: string[] }[] {
  const seen = new Set<string>();
  const out: { level: number; ids: string[] }[] = [];
  let frontier = [rootId];
  for (let level = 1; level <= depth; level += 1) {
    const next: string[] = [];
    for (const parent of frontier) {
      for (const child of graph.store.children(parent)) {
        if (!seen.has(child)) {
          seen.add(child);
          next.push(child);
        }
      }
    }
    out.push({ level, ids: next });
    frontier = next;
    if (next.length === 0) break;
  }
  return out;
}

export function PathLab({ reduced }: { reduced: boolean }) {
  const [queryKey, setQueryKey] = useState<QueryKey>('lineage_down');
  const [subject, setSubject] = useState(SUBJECTS[0].id);
  const [depth, setDepth] = useState(3);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  const query = QUERIES.find((entry) => entry.key === queryKey) ?? QUERIES[0];
  const path = boundedPath(SUBSIDIARY_OF, 1, queryKey === 'exposure' ? depth : Math.max(1, depth - 1));

  const sparql = useMemo(() => {
    const store = graph.store;
    switch (queryKey) {
      case 'exposure':
        return renderExposure(store, '0001880661', '0001691493', true, true, depth);
      case 'lineage_up':
        return renderLineageUp(store, subject, depth);
      case 'neighbors':
        return renderNeighbors(store, subject, 40);
      default:
        return renderLineageDown(store, subject, depth);
    }
  }, [queryKey, subject, depth]);

  const source = useMemo(() => extractFunction(queriesSource, query.fn), [query.fn]);
  const walk = useMemo(() => levels(subject, depth), [subject, depth]);
  const maxStep = Math.max(0, walk.length - 1);

  useEffect(() => { setStep(0); }, [subject, depth, queryKey]);

  useEffect(() => {
    if (!playing || reduced) return undefined;
    const timer = window.setInterval(() => {
      setStep((current) => {
        if (current >= maxStep) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, [playing, reduced, maxStep]);

  return (
    <section className="section" id="paths" aria-labelledby="paths-title">
      <div className="shell">
        <p className="eyebrow">04 / property paths</p>
        <h2 id="paths-title">Bounded property paths, both sides</h2>
        <p className="section__lede">
          SPARQL 1.1 has no bounded repetition and the store specific extensions differ, so
          the API expands a depth limited walk into an alternative of fixed length sequences
          that every store evaluates the same way. Step through it: each alternative is one
          more hop of <code>subsidiaryOf</code>, and the frontier on the right is what that
          hop adds.
        </p>

        <div className="chip-row" style={{ marginTop: 20 }}>
          {QUERIES.map((entry) => (
            <button
              type="button"
              key={entry.key}
              className="btn"
              aria-pressed={entry.key === queryKey}
              onClick={() => setQueryKey(entry.key)}
            >
              <span className="mono">{entry.file}</span>
            </button>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 14, marginTop: 10 }}>{query.blurb}</p>

        <div className="panel" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="field" style={{ minWidth: 220, flex: '1 1 220px' }}>
              <label htmlFor="lab-subject">subject entity</label>
              <div className="select-wrap">
                <select id="lab-subject" value={subject} onChange={(event) => setSubject(event.target.value)}>
                  {SUBJECTS.map((entry) => (
                    <option key={entry.id} value={entry.id}>{entry.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <label className="control-label" htmlFor="lab-depth" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              depth
              <input
                id="lab-depth"
                type="range"
                min={1}
                max={5}
                step={1}
                value={depth}
                style={{ width: 120 }}
                onChange={(event) => setDepth(Number(event.target.value))}
              />
              <span className="mono" style={{ color: 'var(--accent)' }}>{depth}</span>
            </label>
            <div className="chip-row">
              <button type="button" className="btn" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
                back
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setStep(Math.min(maxStep, step + 1))}
                disabled={step >= maxStep}
              >
                step
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => { setStep(0); setPlaying(!playing); }}
              >
                {playing ? 'stop' : 'run all hops'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid--2" style={{ marginTop: 16 }}>
          <div>
            <p className="control-label">{`api/src/main/resources/queries/${query.file}, rendered`}</p>
            <pre className="wrap" style={{ maxHeight: 460 }} tabIndex={0} aria-label={`rendered SPARQL for ${query.file}`}>
              {highlightAlternative(sparql, path, step)}
            </pre>
          </div>
          <div>
            <p className="control-label">{`web/src/graph/queries.ts, ${query.fn}()`}</p>
            <pre className="wrap" style={{ maxHeight: 460 }} tabIndex={0} aria-label={`in-browser equivalent, ${query.fn}`}>
              {source}
            </pre>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 16 }} aria-live="polite">
          <p className="control-label">{`subsidiaryOf frontier from ${graph.store.entity(subject)?.name ?? subject}`}</p>
          {walk.map((entry, index) => (
            <div className="step-line" key={entry.level} data-current={index === step}>
              <span>{`hop ${entry.level}`}</span>
              <span>{`${count(entry.ids.length)} ${entry.ids.length === 1 ? 'entity' : 'entities'}`}</span>
              <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.ids.length === 0
                  ? 'nothing further'
                  : entry.ids.map((id) => graph.store.entity(id)?.name ?? id).join(', ')}
              </span>
            </div>
          ))}
          <p className="mono dim" style={{ fontSize: 11.5, marginTop: 10, marginBottom: 0 }}>
            {`total within depth ${depth}: ${count(walk.reduce((total, entry) => total + entry.ids.length, 0))} entities`}
          </p>
        </div>
      </div>
    </section>
  );
}
