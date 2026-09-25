import demoSummary from '../data/demo-summary.json';
import { sliceManifest } from '../graph';
import { useCountUp } from '../hooks/useCountUp';
import { count } from '../lib/format';

/*
 * The counters lead with what this page holds and computes, and name the full sample beside
 * it at the same size. One figure here is not computed in the browser: the exposure latency
 * measured against Fuseki, read from src/data/demo-summary.json, which
 * scripts/demo_queries.py writes during `make demo` together with the commit, host and
 * timestamp of that run. Nothing on this page is transcribed from a document.
 */

interface CounterProps {
  value: number;
  label: string;
  second: string;
  source: string;
  suffix?: string;
  reduced: boolean;
}

function Counter({ value, label, second, source, suffix, reduced }: CounterProps) {
  const [shown, setNode, settled] = useCountUp(value, reduced);
  return (
    <div className="counter" ref={setNode}>
      {/* The digits animate, so they are hidden from assistive technology and the settled
          value is announced once instead of on every frame. */}
      <div className="counter__value" aria-hidden="true">
        {count(shown)}
        {suffix ?? ''}
      </div>
      <span className="sr-only" aria-live="polite">
        {settled ? `${label}: ${count(value)}${suffix ?? ''}` : ''}
      </span>
      <div className="counter__label">{label}</div>
      <div className="counter__second">{second}</div>
      <span className="counter__source">{source}</span>
    </div>
  );
}

export function Hero({ reduced }: { reduced: boolean }) {
  const slice = sliceManifest.counts;
  const full = sliceManifest.full;
  const measured = demoSummary.exposure;

  return (
    <section className="hero shell" aria-labelledby="hero-title">
      <p className="eyebrow">TradeGraph / browser demo</p>
      <h1 id="hero-title">Counterparty lineage and exposure, answered in the page.</h1>
      <p>
        TradeGraph turns SEC filings into RDF over a FIBO-inspired ontology and answers
        &quot;how much of this issuer does this fund family really hold, and through which
        legal entities&quot; with SPARQL property paths. This page carries a slice of that
        dataset and the same query semantics, so every number below is computed in your
        browser with no API and no store behind it.
      </p>

      <div className="counters">
        <Counter
          value={slice.entities}
          label="legal entities"
          second={`${count(full.entities)} in the full sample`}
          source="computed in this page"
          reduced={reduced}
        />
        <Counter
          value={slice.triples}
          label="triples"
          second={`${count(full.triples)} in the full sample`}
          source="computed in this page"
          reduced={reduced}
        />
        <Counter
          value={slice.positions}
          label="positions"
          second={`${count(full.positions)} in the full sample, ${full.periods.length} quarters`}
          source="computed in this page"
          reduced={reduced}
        />
        <Counter
          value={measured.p50Millis}
          label="median exposure latency"
          suffix=" ms"
          second={`max ${count(measured.maxMillis)} ms over ${measured.queries} queries`}
          source={`measured on ${demoSummary.store}, uncached`}
          reduced={reduced}
        />
      </div>

      <p className="hero__note">
        {`The first three counters are this page's own store: ${count(slice.entities)} entities, `}
        {`${count(slice.positions)} positions and ${count(slice.triples)} triples in `}
        {`${(sliceManifest.bytes / 1024).toFixed(0)} KiB, periods ${sliceManifest.periods.join(' and ')}. `}
        {`The latency is the one figure this page did not compute: `}
        {`scripts/demo_queries.py measured it against ${demoSummary.store} at commit `}
        {`${demoSummary.provenance.commit} on ${demoSummary.provenance.host}, `}
        {`${demoSummary.provenance.measuredAt}. In-browser query times are shown per section.`}
      </p>
    </section>
  );
}
