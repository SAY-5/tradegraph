import { sliceManifest } from '../graph';
import { useCountUp } from '../hooks/useCountUp';
import { count } from '../lib/format';

/** Exposure latency p50 over the 72 query grid, from the README's `make demo` run on Fuseki. */
export const README_MEDIAN_EXPOSURE_MS = 64;

interface CounterProps {
  value: number;
  label: string;
  source: string;
  suffix?: string;
  reduced: boolean;
}

function Counter({ value, label, source, suffix, reduced }: CounterProps) {
  const [shown, setNode] = useCountUp(value, reduced);
  return (
    <div className="counter" ref={setNode}>
      <div className="counter__value">
        {count(shown)}
        {suffix ?? ''}
      </div>
      <div className="counter__label">{label}</div>
      <div className="counter__source">{source}</div>
    </div>
  );
}

export function Hero({ reduced }: { reduced: boolean }) {
  const full = sliceManifest.full;
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

      <div className="counters" aria-live="polite" aria-atomic="true">
        <Counter
          value={full.entities}
          label="legal entities"
          source="full dataset"
          reduced={reduced}
        />
        <Counter
          value={full.triples}
          label="triples"
          source="full dataset"
          reduced={reduced}
        />
        <Counter
          value={full.positions}
          label="positions"
          source="full dataset"
          reduced={reduced}
        />
        <Counter
          value={README_MEDIAN_EXPOSURE_MS}
          label="median exposure latency"
          source="README, Fuseki, uncached"
          suffix=" ms"
          reduced={reduced}
        />
      </div>

      <p className="hero__note">
        {`slice in this page: ${count(sliceManifest.counts.entities)} entities, `}
        {`${count(sliceManifest.counts.positions)} positions, `}
        {`${count(sliceManifest.counts.triples)} triples, `}
        {`${(sliceManifest.bytes / 1024).toFixed(0)} KiB`}
      </p>
    </section>
  );
}
