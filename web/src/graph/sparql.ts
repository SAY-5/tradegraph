/*
 * The SPARQL side of the demo: the same template rendering the API does, so the query text
 * shown next to the in-browser walk is the text the API would actually send.
 *
 * Mirrors QueryTemplates.render, SparqlValues and the clause builders in ExposureService.
 */

import { boundedPath, EXPOSURE_MAX_DEPTH, SUBSIDIARY_OF } from './queries';
import type { TripleStore } from './store';

export const ENTITY_NS = 'https://tradegraph.dev/entity/';
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const PLACEHOLDER = /\$\{([a-zA-Z]+)\}/g;

export function entityIri(id: string): string {
  if (!ID.test(id)) throw new Error(`invalid entity id: ${id}`);
  return `<${ENTITY_NS}${id}>`;
}

export function literal(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

/** `UNION { subject (p|p/p) object }`, or nothing when the depth allows no extra hop. */
export function unionHops(subject: string, object: string, minHops: number, maxHops: number): string {
  const path = boundedPath(SUBSIDIARY_OF, minHops, maxHops);
  return path === '' ? '' : `UNION { ${subject} ${path} ${object} }`;
}

export function holderClause(fundIri: string, includeAffiliates: boolean, depth: number): string {
  if (!includeAffiliates) return `BIND(${fundIri} AS ?holder)`;
  return `{ BIND(${fundIri} AS ?root) } ${unionHops(fundIri, '?root', 1, depth)}\n`
    + '  FILTER NOT EXISTS { ?root tg:subsidiaryOf ?above }\n'
    + '  ?holder a tg:Fund .\n'
    + `  FILTER(?holder = ?root || EXISTS { ?holder ${boundedPath(SUBSIDIARY_OF, 1, depth)} ?root })`;
}

export function issuerClause(issuerIri: string, includeSubsidiaries: boolean, depth: number): string {
  if (!includeSubsidiaries) return `BIND(${issuerIri} AS ?issuerEntity)`;
  return `{ BIND(${issuerIri} AS ?issuerEntity) } ${unionHops('?issuerEntity', issuerIri, 1, depth)}`;
}

/** `VALUES ?var { "2024-06-30"^^xsd:date }`, pinning a query to one reporting period. */
export function valuesBlock(variable: string, period: string | null): string {
  return period === null
    ? `VALUES ?${variable} { }`
    : `VALUES ?${variable} { "${period}"^^xsd:date }`;
}

/** Renders `queries/<name>.rq` with the prefixes prepended, refusing unresolved placeholders. */
export function render(store: TripleStore, name: string, params: Record<string, string>): string {
  const template = store.queries[name];
  if (template === undefined) throw new Error(`unknown query template: ${name}`);
  const body = template.replace(PLACEHOLDER, (_match, key: string) => {
    const value = params[key];
    if (value === undefined) throw new Error(`unresolved placeholder \${${key}} in ${name}`);
    return value;
  });
  return `${store.queries.prefixes ?? ''}\n${body}`;
}

export function renderExposure(
  store: TripleStore,
  fundId: string,
  issuerId: string,
  includeAffiliates: boolean,
  includeSubsidiaries: boolean,
  depth: number,
  period: string | null,
): string {
  const fundIri = entityIri(fundId);
  const issuerIri = entityIri(issuerId);
  return render(store, 'exposure', {
    fund: fundIri,
    issuer: issuerIri,
    depth: String(Math.min(depth, EXPOSURE_MAX_DEPTH)),
    periodValues: valuesBlock('d', period),
    holderClause: holderClause(fundIri, includeAffiliates, Math.min(depth, EXPOSURE_MAX_DEPTH)),
    issuerClause: issuerClause(issuerIri, includeSubsidiaries, Math.min(depth, EXPOSURE_MAX_DEPTH)),
  });
}

/**
 * `floor` is what `ConcentrationService` renders: the share threshold times the family
 * total, which the store applies as a HAVING clause before the LIMIT. Both bounds are part
 * of the query text, so the page shows the same bounded query the API sends.
 */
export function renderConcentration(
  store: TripleStore,
  fundId: string,
  period: string | null,
  floor: number,
  limit: number,
): string {
  const iri = entityIri(fundId);
  return render(store, 'concentration', {
    fund: iri,
    periodValues: valuesBlock('d', period),
    holderClause: holderClause(iri, true, EXPOSURE_MAX_DEPTH),
    floor: floor.toFixed(2),
    limit: String(Math.max(1, Math.trunc(limit))),
  });
}

/**
 * Empty, as `LineageService.directOnly` renders it with reasoning off. A store that
 * materialises the closure reports every ancestor as a direct parent, and the filter
 * keeps the chain walk on direct edges; this page never reasons, so it renders nothing.
 */
const DIRECT_ONLY = '';

export function renderLineageDown(store: TripleStore, id: string, depth: number): string {
  const iri = entityIri(id);
  return render(store, 'lineage_down', {
    iri,
    depth: String(depth),
    directOnly: DIRECT_ONLY,
    moreParents: unionHops('?parent', iri, 1, depth - 1),
  });
}

export function renderLineageUp(store: TripleStore, id: string, depth: number): string {
  const iri = entityIri(id);
  return render(store, 'lineage_up', {
    iri,
    depth: String(depth),
    directOnly: DIRECT_ONLY,
    moreChildren: unionHops(iri, '?child', 1, depth - 1),
  });
}

export function renderNeighbors(store: TripleStore, id: string, limit: number): string {
  return render(store, 'neighbors', { iri: entityIri(id), limit: String(limit) });
}
