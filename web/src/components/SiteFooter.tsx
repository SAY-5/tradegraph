import { sliceManifest } from '../graph';
import { count } from '../lib/format';

const REPO = 'https://github.com/SAY-5/tradegraph';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell">
        <ul>
          <li><a href={REPO}>Repository</a></li>
          <li><a href={`${REPO}/blob/main/ARCHITECTURE.md`}>ARCHITECTURE.md</a></li>
          <li><a href={`${REPO}/blob/main/ontology/tradegraph.ttl`}>ontology/tradegraph.ttl</a></li>
          <li><a href={`${REPO}/blob/main/scripts/demo_queries.py`}>scripts/demo_queries.py</a></li>
          <li><a href={`${REPO}/tree/main/api/src/main/resources/queries`}>SPARQL templates</a></li>
          <li><a href={`${REPO}/tree/main/web`}>Source of this page</a></li>
        </ul>
        <p className="fine">
          {`Real: issuer and fund manager identities (SEC company_tickers.json), the ontology, `}
          {`the query semantics and every number this page computes. Synthetic and deterministic: `}
          {`holdings, subsidiary lists, quantities, values, CUSIPs and accession numbers, from `}
          {`etl/sample. Sliced: ${count(sliceManifest.counts.entities)} of `}
          {`${count(sliceManifest.full.entities)} entities and `}
          {`${count(sliceManifest.counts.positions)} of ${count(sliceManifest.full.positions)} positions, `}
          {`sha256 ${sliceManifest.sha256.slice(0, 12)}. Do not treat the values as market data.`}
        </p>
      </div>
    </footer>
  );
}
