import { useMemo, useState } from 'react';

import { graph, mergeGraphs } from '../graph';
import type { EntitySummary, NeighborGraph } from '../graph';
import { compactMoney, count, millis } from '../lib/format';
import { ForceGraph } from './ForceGraph';
import { LineageTree } from './LineageTree';

const START = '0000320193'; // Apple Inc.

export function Explorer({ reduced }: { reduced: boolean }) {
  const [query, setQuery] = useState('apple');
  const [selected, setSelected] = useState(START);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [expansions, setExpansions] = useState<string[]>([]);
  const [depth, setDepth] = useState(5);

  const results: EntitySummary[] = useMemo(() => {
    if (query.trim().length < 2) return [];
    try {
      return graph.search(query, 12).value;
    } catch {
      return [];
    }
  }, [query]);

  const entity = graph.store.entity(selected);
  const lineage = graph.lineage(selected, depth);
  const neighborhood = graph.neighbors(selected, 40);

  const merged: NeighborGraph = useMemo(() => {
    let combined = neighborhood.value;
    for (const id of expansions) {
      if (id === selected) continue;
      combined = mergeGraphs(combined, graph.neighbors(id, 24).value);
    }
    return combined;
  }, [neighborhood.value, expansions, selected]);

  const held = graph.store.heldBy.get(selected) ?? [];
  const issued = graph.store.issuedBy.get(selected) ?? [];
  const heldValue = held.reduce((total, position) => total + position.value, 0);
  const issuedValue = issued.reduce((total, position) => total + position.value, 0);

  const select = (id: string): void => {
    setSelected(id);
    setExpanded(new Set<string>());
    setExpansions([]);
  };

  const expand = (id: string): void => {
    if (id === selected) return;
    if (expanded.has(id)) {
      select(id);
      return;
    }
    const next = new Set(expanded);
    next.add(id);
    setExpanded(next);
    setExpansions([...expansions, id]);
  };

  return (
    <section className="section" id="explorer" aria-labelledby="explorer-title">
      <div className="shell">
        <p className="eyebrow">02 / explorer</p>
        <h2 id="explorer-title">Search, expand, walk the tree</h2>
        <p className="section__lede">
          Search matches a name substring, a ticker or a CIK and puts ticker hits first, the
          way <code>search.rq</code> orders them. Clicking a node in the graph runs
          <code> neighbors.rq</code> for that entity and merges the answer into what is
          already drawn; clicking it again recentres. The tree is the depth limited
          <code> subsidiaryOf</code> walk.
        </p>

        <div className="grid grid--side" style={{ marginTop: 24 }}>
          <div>
            <div className="panel">
              <div className="field">
                <label htmlFor="entity-search">search entities</label>
                <input
                  id="entity-search"
                  type="search"
                  value={query}
                  placeholder="apple, TROW, 0000320193"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <ul className="result-list" style={{ marginTop: 12 }}>
                {results.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="result-btn"
                      aria-current={row.id === selected}
                      onClick={() => select(row.id)}
                    >
                      <span className="name">{row.name}</span>
                      <br />
                      <span className="meta">
                        {[row.ticker, row.id, row.kinds.join(' + ')].filter(Boolean).join('  ')}
                      </span>
                    </button>
                  </li>
                ))}
                {results.length === 0 ? (
                  <li className="muted" style={{ padding: '10px 4px', fontSize: 13 }}>
                    {query.trim().length < 2 ? 'Type at least two characters.' : 'Nothing in the slice matches.'}
                  </li>
                ) : null}
              </ul>
            </div>

            {entity ? (
              <div className="panel" style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 16 }}>{entity.name}</h3>
                <div className="chip-row" style={{ marginTop: 10 }}>
                  {entity.kinds.map((kind) => (
                    <span className="badge badge--kind" key={kind}>{`tg:${kind}`}</span>
                  ))}
                </div>
                <table style={{ marginTop: 12 }}>
                  <tbody>
                    <tr>
                      <th scope="row">id</th>
                      <td className="mono">{entity.id}</td>
                    </tr>
                    {entity.ticker ? (
                      <tr>
                        <th scope="row">ticker</th>
                        <td className="mono">{entity.ticker}</td>
                      </tr>
                    ) : null}
                    {entity.jurisdiction ? (
                      <tr>
                        <th scope="row">jurisdiction</th>
                        <td className="mono">{entity.jurisdiction}</td>
                      </tr>
                    ) : null}
                    <tr>
                      <th scope="row">parent</th>
                      <td>
                        {entity.parent ? (
                          <button type="button" className="btn btn--ghost" onClick={() => select(entity.parent!)}>
                            {graph.store.entity(entity.parent)?.name ?? entity.parent}
                          </button>
                        ) : <span className="dim mono">none</span>}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">positions held</th>
                      <td className="mono">{`${count(held.length)}  ${compactMoney(heldValue)}`}</td>
                    </tr>
                    <tr>
                      <th scope="row">positions issued</th>
                      <td className="mono">{`${count(issued.length)}  ${compactMoney(issuedValue)}`}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          <div>
            <ForceGraph data={merged} reduced={reduced} onExpand={expand} expanded={expanded} />
            <div className="legend">
              <span><i style={{ background: 'var(--accent)' }} />fund</span>
              <span><i style={{ border: '1.5px solid var(--accent-line)' }} />issuer</span>
              <span><i style={{ background: 'var(--neutral-bar)' }} />subsidiary</span>
              <span><i style={{ background: 'var(--accent-line)', borderRadius: 0, height: 2, width: 16 }} />subsidiaryOf</span>
              <span><i style={{ background: 'var(--line-strong)', borderRadius: 0, height: 2, width: 16 }} />holds</span>
            </div>
            <div className="stat-row" aria-live="polite">
              <span className="badge">{`${count(merged.nodes.length)} nodes`}</span>
              <span className="badge">{`${count(merged.links.length)} links`}</span>
              <span className={`badge${neighborhood.cacheHit ? ' badge--hit' : ''}`}>
                {`neighbors ${millis(neighborhood.millis)}${neighborhood.cacheHit ? ' cached' : ''}`}
              </span>
              {expansions.length > 0 ? (
                <button type="button" className="btn btn--ghost" onClick={() => select(selected)}>
                  reset expansions
                </button>
              ) : null}
            </div>

            <div className="panel" style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <h3 style={{ fontSize: 15 }}>Corporate tree</h3>
                <label className="control-label" htmlFor="lineage-depth" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  depth
                  <input
                    id="lineage-depth"
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={depth}
                    style={{ width: 110 }}
                    onChange={(event) => setDepth(Number(event.target.value))}
                  />
                  <span className="mono" style={{ color: 'var(--accent)' }}>{depth}</span>
                </label>
              </div>
              <div className="stat-row" style={{ marginTop: 4, marginBottom: 10 }} aria-live="polite">
                <span className="badge">{`${count(lineage.value.descendantCount)} descendants`}</span>
                <span className="badge">{`deepest level ${lineage.value.deepestLevel}`}</span>
                <span className="badge">{`ultimate parent ${lineage.value.ultimateParent.name}`}</span>
                <span className={`badge${lineage.cacheHit ? ' badge--hit' : ''}`}>
                  {`lineage ${millis(lineage.millis)}${lineage.cacheHit ? ' cached' : ''}`}
                </span>
              </div>
              <LineageTree root={lineage.value.descendants} onSelect={select} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
