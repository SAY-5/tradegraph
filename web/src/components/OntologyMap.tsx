import { useMemo, useState } from 'react';

import { graph, shorten, TG } from '../graph';

/*
 * The class and property diagram is drawn from the ontology triples the slice carries
 * verbatim from ontology/tradegraph.ttl, so the labels, the comments and the domain and
 * range rows below the diagram are the ontology's own words.
 */

const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL = 'http://www.w3.org/2002/07/owl#';

interface Term {
  iri: string;
  short: string;
  label: string;
  comment: string | null;
  types: string[];
  rows: [string, string][];
}

interface ClassBox {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const CLASSES: ClassBox[] = [
  { key: 'LegalEntity', x: 120, y: 48, w: 170, h: 36 },
  { key: 'Counterparty', x: 40, y: 126, w: 165, h: 36 },
  { key: 'Subsidiary', x: 235, y: 126, w: 150, h: 36 },
  { key: 'Issuer', x: 30, y: 204, w: 120, h: 36 },
  { key: 'Fund', x: 170, y: 204, w: 120, h: 36 },
  { key: 'Position', x: 600, y: 70, w: 140, h: 36 },
  { key: 'Trade', x: 770, y: 70, w: 140, h: 36 },
  { key: 'Instrument', x: 770, y: 220, w: 140, h: 36 },
  { key: 'Filing', x: 630, y: 300, w: 140, h: 36 },
];

const SUBCLASS: { d: string }[] = [
  { d: 'M122,126 L168,86' },
  { d: 'M310,126 L246,86' },
  { d: 'M90,204 L104,164' },
  { d: 'M230,204 L152,164' },
  { d: 'M770,88 L742,88' },
];

interface PropertyEdge {
  key: string;
  d: string;
  labelX: number;
  labelY: number;
  anchor?: 'start' | 'middle' | 'end';
}

const PROPERTY_EDGES: PropertyEdge[] = [
  { key: 'subsidiaryOf', d: 'M170,48 C168,18 242,18 239,46', labelX: 205, labelY: 26 },
  { key: 'counterpartyOf', d: 'M70,126 C68,98 142,98 139,124', labelX: 105, labelY: 106 },
  { key: 'holds', d: 'M290,220 L597,96', labelX: 440, labelY: 148 },
  { key: 'instrument', d: 'M718,108 L798,217', labelX: 772, labelY: 172, anchor: 'start' },
  { key: 'filedIn', d: 'M694,108 L694,297', labelX: 702, labelY: 200, anchor: 'start' },
  { key: 'issuer', d: 'M622,108 L622,268 Q622,280 610,280 L102,280 Q90,280 90,268 L90,243', labelX: 350, labelY: 272 },
  { key: 'issuedBy', d: 'M840,258 L840,420 Q840,432 828,432 L72,432 Q60,432 60,420 L60,243', labelX: 450, labelY: 425 },
];

function buildTerms(): Map<string, Term> {
  const store = graph.store;
  const subjects = new Set(store.triples.filter((t) => t.s.startsWith(TG)).map((t) => t.s));
  const terms = new Map<string, Term>();
  for (const iri of subjects) {
    const triples = store.match(iri);
    const one = (p: string): string | null => triples.find((t) => t.p === p)?.o ?? null;
    const all = (p: string): string[] => triples.filter((t) => t.p === p).map((t) => t.o);
    const rows: [string, string][] = [];
    const addRow = (label: string, values: string[]): void => {
      if (values.length > 0) rows.push([label, values.map(shorten).join(', ')]);
    };
    addRow('subclass of', all(`${RDFS}subClassOf`));
    addRow('sub-property of', all(`${RDFS}subPropertyOf`));
    addRow('domain', all(`${RDFS}domain`));
    addRow('range', all(`${RDFS}range`));
    addRow('inverse of', all(`${OWL}inverseOf`));
    addRow('equivalent to', all(`${OWL}equivalentProperty`));
    const types = all('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
    const characteristics = types
      .filter((t) => t === `${OWL}TransitiveProperty` || t === `${OWL}SymmetricProperty`)
      .map((t) => shorten(t));
    addRow('characteristics', characteristics);
    terms.set(iri.slice(TG.length), {
      iri,
      short: shorten(iri),
      label: one(`${RDFS}label`) ?? iri.slice(TG.length),
      comment: one(`${RDFS}comment`),
      types,
      rows,
    });
  }
  return terms;
}

export function OntologyMap() {
  const terms = useMemo(buildTerms, []);
  const [active, setActive] = useState<string>('subsidiaryOf');
  const current = terms.get(active);

  const classKeys = CLASSES.map((c) => c.key);
  const propertyKeys = [...terms.keys()]
    .filter((key) => !classKeys.includes(key))
    .sort((a, b) => a.localeCompare(b));

  return (
    <section className="section" id="ontology" aria-labelledby="ontology-title">
      <div className="shell">
        <p className="eyebrow">01 / ontology</p>
        <h2 id="ontology-title">A vocabulary you can hold in your head</h2>
        <p className="section__lede">
          FIBO models control relationships and issuance with dozens of classes. TradeGraph
          keeps the same shape in nine, so every query in the API fits on one screen. Hover
          or focus a box, an arrow or a term below to read the ontology&apos;s own definition.
        </p>

        <div className="grid grid--wide-side" style={{ marginTop: 24 }}>
          <div className="canvas">
            {/* role="group", not role="img": the boxes and arrows below are focusable buttons. */}
            <svg
              viewBox="0 0 940 480"
              role="group"
              aria-label="TradeGraph ontology class and property diagram"
            >
              <defs>
                <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
                </marker>
                <marker id="arrow-open" viewBox="0 0 9 9" refX="8" refY="4.5" markerWidth="8" markerHeight="8" orient="auto">
                  <path d="M0,0 L9,4.5 L0,9 z" fill="none" stroke="currentColor" strokeWidth="1" />
                </marker>
              </defs>

              {SUBCLASS.map((edge) => (
                <path
                  key={edge.d}
                  d={edge.d}
                  className="ontology-edge"
                  strokeDasharray="4 3"
                  markerEnd="url(#arrow-open)"
                  color="currentColor"
                />
              ))}

              {PROPERTY_EDGES.map((edge) => {
                const isActive = active === edge.key;
                return (
                  <g
                    key={edge.key}
                    tabIndex={0}
                    role="button"
                    aria-label={`property ${edge.key}`}
                    onMouseEnter={() => setActive(edge.key)}
                    onFocus={() => setActive(edge.key)}
                    onClick={() => setActive(edge.key)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      setActive(edge.key);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <path
                      d={edge.d}
                      className={`ontology-edge${isActive ? ' ontology-edge--active' : ''}`}
                      markerEnd="url(#arrow)"
                      strokeWidth={isActive ? 1.8 : 1}
                    />
                    <text
                      x={edge.labelX}
                      y={edge.labelY}
                      textAnchor={edge.anchor ?? 'middle'}
                      className={`ontology-edge-label${isActive ? ' ontology-edge-label--active' : ''}`}
                    >
                      {`tg:${edge.key}`}
                    </text>
                  </g>
                );
              })}

              {CLASSES.map((box) => (
                <g
                  key={box.key}
                  className="ontology-node"
                  data-active={active === box.key}
                  tabIndex={0}
                  role="button"
                  aria-label={`class ${box.key}`}
                  onMouseEnter={() => setActive(box.key)}
                  onFocus={() => setActive(box.key)}
                  onClick={() => setActive(box.key)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    setActive(box.key);
                  }}
                >
                  <rect x={box.x} y={box.y} width={box.w} height={box.h} />
                  <text x={box.x + box.w / 2} y={box.y + box.h / 2 + 4} textAnchor="middle">
                    {`tg:${box.key}`}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          <div className="panel definition" aria-live="polite">
            <h3>{current ? current.short : ''}</h3>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
              {current ? current.label : ''}
            </p>
            <p style={{ fontSize: 14, marginTop: 12 }}>
              {current?.comment ?? 'No rdfs:comment in the ontology for this term.'}
            </p>
            {current && current.rows.length > 0 ? (
              <dl>
                {current.rows.map(([label, value]) => (
                  <div key={label} style={{ display: 'contents' }}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </div>

        <p className="control-label" style={{ marginTop: 24 }}>every term in the vocabulary</p>
        <div className="chip-row">
          {[...classKeys, ...propertyKeys].map((key) => (
            <button
              type="button"
              key={key}
              className="btn btn--ghost"
              aria-pressed={active === key}
              onMouseEnter={() => setActive(key)}
              onFocus={() => setActive(key)}
              onClick={() => setActive(key)}
            >
              <span className="mono">{`tg:${key}`}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
