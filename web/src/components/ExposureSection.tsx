import { useMemo, useState } from 'react';

import { graph } from '../graph';
import type { ExposureLine } from '../graph';
import { compactMoney, count, millis, money, percent } from '../lib/format';

/** The four pairs the README's demo block prints. */
const PRESETS: { label: string; fund: string; issuer: string }[] = [
  { label: 'T. Rowe Price to Apple', fund: '0001113169', issuer: '0000320193' },
  { label: 'BlackRock to Meta', fund: '0002012383', issuer: '0001326801' },
  { label: 'Invesco to Apple', fund: '0000914208', issuer: '0000320193' },
  { label: 'TPG to Nu Holdings', fund: '0001880661', issuer: '0001691493' },
];

const HOP_LABEL: Record<string, string> = {
  start: 'fund',
  parent: 'is a subsidiary of',
  subsidiary: 'whose subsidiary',
  holds: 'holds, issued by',
};

function PathChips({ line, reduced }: { line: ExposureLine; reduced: boolean }) {
  return (
    <div className="path-chips">
      {line.lineagePath.map((step, index) => (
        <span key={`${step.id}-${index}`} style={{ display: 'contents' }}>
          {index > 0 ? <span className="path-arrow" aria-hidden="true">{'->'}</span> : null}
          <span
            className={`path-chip path-chip--${step.hop}`}
            title={`${HOP_LABEL[step.hop] ?? step.hop}: ${step.id}`}
            style={reduced ? { animationDelay: '0ms' } : { animationDelay: `${index * 110}ms` }}
          >
            {step.name}
          </span>
        </span>
      ))}
    </div>
  );
}

export function ExposureSection({ reduced }: { reduced: boolean }) {
  const [fund, setFund] = useState(PRESETS[0].fund);
  const [issuer, setIssuer] = useState(PRESETS[0].issuer);
  const [includeAffiliates, setIncludeAffiliates] = useState(true);
  const [includeSubsidiaries, setIncludeSubsidiaries] = useState(true);
  const [depth, setDepth] = useState(5);
  const [lineIndex, setLineIndex] = useState(0);

  const families = useMemo(() => [...graph.store.entities.values()]
    .filter((entity) => entity.kinds.includes('Fund') && entity.parent === null)
    .sort((a, b) => a.name.localeCompare(b.name)), []);

  const issuers = useMemo(() => {
    const value = new Map<string, number>();
    for (const [id, positions] of graph.store.issuedBy) {
      value.set(id, positions.reduce((total, position) => total + position.value, 0));
    }
    return [...graph.store.entities.values()]
      .filter((entity) => entity.kinds.includes('Issuer') && entity.parent === null)
      .sort((a, b) => (value.get(b.id) ?? 0) - (value.get(a.id) ?? 0) || a.name.localeCompare(b.name));
  }, []);

  const answer = graph.exposure(fund, issuer, { includeAffiliates, includeSubsidiaries, depth });
  const result = answer.value;
  const lines = result.byInstrument;
  const focused = lines[Math.min(lineIndex, Math.max(0, lines.length - 1))];

  const apply = (nextFund: string, nextIssuer: string): void => {
    setFund(nextFund);
    setIssuer(nextIssuer);
    setLineIndex(0);
  };

  const legs = [
    { key: 'direct', label: 'direct', value: result.directValue, className: 'leg__fill--direct' },
    { key: 'subs', label: 'via subsidiaries', value: result.viaSubsidiariesValue, className: 'leg__fill--subs' },
    { key: 'affiliates', label: 'via affiliates', value: result.viaAffiliatesValue, className: 'leg__fill--affiliates' },
  ];
  const legSum = legs.reduce((total, leg) => total + leg.value, 0);

  return (
    <section className="section" id="exposure" aria-labelledby="exposure-title">
      <div className="shell">
        <p className="eyebrow">03 / exposure</p>
        <h2 id="exposure-title">How much of this issuer does the family really hold</h2>
        <p className="section__lede">
          One aggregate query: find the fund&apos;s ultimate parent, take every fund in that
          family as a holder, take the issuer and its subsidiaries as issuing entities, join
          the positions and group them. The total is partitioned into three legs that add up
          to it exactly, and every line carries the path that produced it.
        </p>

        <div className="chip-row" style={{ marginTop: 20 }}>
          {PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.label}
              className="btn"
              aria-pressed={fund === preset.fund && issuer === preset.issuer}
              onClick={() => apply(preset.fund, preset.issuer)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="panel" style={{ marginTop: 16 }}>
          <div className="grid grid--2">
            <div className="field">
              <label htmlFor="fund-picker">fund family</label>
              <div className="select-wrap">
                <select
                  id="fund-picker"
                  value={fund}
                  onChange={(event) => { setFund(event.target.value); setLineIndex(0); }}
                >
                  {families.map((entity) => (
                    <option key={entity.id} value={entity.id}>{entity.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="issuer-picker">issuer</label>
              <div className="select-wrap">
                <select
                  id="issuer-picker"
                  value={issuer}
                  onChange={(event) => { setIssuer(event.target.value); setLineIndex(0); }}
                >
                  {issuers.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.ticker ? `${entity.name} (${entity.ticker})` : entity.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', marginTop: 16,
            }}
          >
            <label className="toggle">
              <input
                type="checkbox"
                checked={includeAffiliates}
                onChange={(event) => setIncludeAffiliates(event.target.checked)}
              />
              include affiliates
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={includeSubsidiaries}
                onChange={(event) => setIncludeSubsidiaries(event.target.checked)}
              />
              include issuer subsidiaries
            </label>
            <label className="control-label" htmlFor="exposure-depth" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              depth
              <input
                id="exposure-depth"
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
          </div>
        </div>

        <div className="grid grid--2" style={{ marginTop: 16 }}>
          <div className="panel">
            <p className="control-label">total exposure</p>
            <p className="counter__value" style={{ marginTop: 2 }} aria-live="polite">{money(result.totalValue)}</p>
            <div className="legs" style={{ marginTop: 16 }}>
              {legs.map((leg) => (
                <div key={leg.key}>
                  <div className="leg__head">
                    <span>{leg.label}</span>
                    <span className="num">{money(leg.value)}</span>
                  </div>
                  <div className="leg__track">
                    <div
                      className={`leg__fill ${leg.className}`}
                      style={{ width: `${percent(leg.value, result.totalValue)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mono dim" style={{ fontSize: 11.5, marginTop: 12, marginBottom: 0 }}>
              {`legs sum ${money(legSum)} = total ${money(result.totalValue)}`}
            </p>
            <div className="stat-row" aria-live="polite">
              <span className="badge">{`${count(result.positions)} positions`}</span>
              <span className="badge">{`${count(lines.length)} instrument lines`}</span>
              <span className="badge">{`${count(result.byHolder.length)} holders`}</span>
              <span className="badge">{`longest path ${result.longestPath} hops`}</span>
              <span className={`badge${answer.cacheHit ? ' badge--hit' : ''}`}>
                {answer.cacheHit ? `cache hit ${millis(answer.millis)}` : `computed ${millis(answer.millis)}`}
              </span>
            </div>
          </div>

          <div className="panel">
            <p className="control-label">path for the selected line</p>
            {focused ? (
              <>
                <PathChips line={focused} reduced={reduced} />
                <p className="explanation">{focused.explanation}</p>
                <div className="stat-row">
                  <span className="badge">{`${focused.pathLength} hops`}</span>
                  <span className="badge">{`${focused.instrument.instrumentClass}${focused.instrument.ticker ? ` ${focused.instrument.ticker}` : ''}`}</span>
                  <span className="badge">{`cusip ${focused.instrument.cusip}`}</span>
                  <span className="badge">{money(focused.value)}</span>
                  {focused.direct ? <span className="badge badge--hit">direct</span> : null}
                  {focused.viaAffiliate ? <span className="badge">via affiliate</span> : null}
                  {focused.viaSubsidiary ? <span className="badge">via issuer subsidiary</span> : null}
                </div>
              </>
            ) : (
              <p className="muted" style={{ fontSize: 14 }}>
                No positions connect this family to this issuer under the current options.
              </p>
            )}
          </div>
        </div>

        {lines.length > 0 ? (
          <div className="panel panel--flush scroll-x" style={{ marginTop: 16 }}>
            <table>
              <caption className="control-label" style={{ textAlign: 'left', padding: '12px 12px 4px' }}>
                by instrument, largest first
              </caption>
              <thead>
                <tr>
                  <th scope="col">holder</th>
                  <th scope="col">issuing entity</th>
                  <th scope="col">instrument</th>
                  <th scope="col" className="num">hops</th>
                  <th scope="col" className="num">positions</th>
                  <th scope="col" className="num">value</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={`${line.holder.id}-${line.issuerEntity.id}-${line.instrument.cusip}`}>
                    <td>
                      <button
                        type="button"
                        className="result-btn"
                        style={{ padding: 0 }}
                        aria-current={index === lineIndex}
                        onClick={() => setLineIndex(index)}
                      >
                        {line.holder.name}
                      </button>
                    </td>
                    <td>{line.issuerEntity.name}</td>
                    <td className="mono">
                      {`${line.instrument.instrumentClass}${line.instrument.ticker ? ` ${line.instrument.ticker}` : ''}`}
                    </td>
                    <td className="num">{line.pathLength}</td>
                    <td className="num">{count(line.positions)}</td>
                    <td className="num">{compactMoney(line.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
