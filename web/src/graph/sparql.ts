/*
 * The SPARQL side of the demo: the same template rendering the API does, so the query text
 * shown next to the in-browser walk is the text the API would actually send.
 *
 * Mirrors QueryTemplates.render, SparqlValues and the clause builders in ExposureService.
 */

import { boundedPath, SUBSIDIARY_OF } from './queries';
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
): string {
  const fundIri = entityIri(fundId);
  const issuerIri = entityIri(issuerId);
  return render(store, 'exposure', {
    fund: fundIri,
    issuer: issuerIri,
    depth: String(depth),
    holderClause: holderClause(fundIri, includeAffiliates, depth),
    issuerClause: issuerClause(issuerIri, includeSubsidiaries, depth),
  });
}

export function renderLineageDown(store: TripleStore, id: string, depth: number): string {
  const iri = entityIri(id);
  return render(store, 'lineage_down', {
    iri,
    depth: String(depth),
    moreParents: unionHops('?parent', iri, 1, depth - 1),
  });
}

export function renderLineageUp(store: TripleStore, id: string, depth: number): string {
  const iri = entityIri(id);
  return render(store, 'lineage_up', {
    iri,
    depth: String(depth),
    moreChildren: unionHops(iri, '?child', 1, depth - 1),
  });
}

export function renderNeighbors(store: TripleStore, id: string, limit: number): string {
  return render(store, 'neighbors', { iri: entityIri(id), limit: String(limit) });
}
