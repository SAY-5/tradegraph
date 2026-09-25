/*
 * Query functions over the in-memory store, mirroring the Spring Boot services.
 *
 * Each function follows the shape of the SPARQL template it replaces
 * (api/src/main/resources/queries/*.rq) and the Java that post-processes the rows:
 *
 *   lineage()   lineage_up.rq + lineage_down.rq  -> LineageService
 *   exposure()  exposure.rq                      -> ExposureService
 *   neighbors() neighbors.rq                     -> GraphService
 *   search()    search.rq                        -> EntityService
 *   stats()     stats.rq                         -> StatsService
 *
 * Nothing here reads the clock for anything but the reported duration, and nothing
 * draws on a random source, so the same arguments always give the same answer.
 */

import { RDF_TYPE, TG, TripleStore } from './store';
import type {
  ConcentrationLine, ConcentrationResponse, EntityRef, EntitySummary, ExposureLine, ExposureOptions,
  ExposureResponse, HolderTotal, Instrument, LineageNode, LineageResponse, NeighborGraph, NeighborLink,
  NeighborNode, PathStep, PositionNode, Stats, TradeRecord,
} from './types';

/** tradegraph.lineage.max-depth and tradegraph.exposure.max-depth from application.yml. */
export const MAX_DEPTH = 5;
export const EXPOSURE_MAX_DEPTH = 4;
export const DEFAULT_MIN_SHARE = 0.01;
export const SUBSIDIARY_OF = 'tg:subsidiaryOf';

/** `(p|p/p|p/p/p)` for min=1, max=3, exactly as SparqlPaths.bounded builds it. */
export function boundedPath(property: string, min: number, max: number): string {
  if (min < 1) throw new Error('min must be at least 1');
  if (max < min) return '';
  const alternatives: string[] = [];
  for (let length = min; length <= max; length += 1) {
    alternatives.push(new Array<string>(length).fill(property).join('/'));
  }
  return `(${alternatives.join('|')})`;
}

export function clampDepth(requested: number | undefined, max = MAX_DEPTH): number {
  if (requested === undefined) return max;
  return Math.min(Math.max(Math.trunc(requested), 1), max);
}

/* ------------------------------------------------------------------ periods */

/**
 * Reporting periods in the store, newest first. A 13F-HR is filed for a quarter end, so
 * every position carries the period of its filing and a query that pinned no period would
 * sum the same holding once per quarter.
 */
export function periods(store: TripleStore): string[] {
  return [...new Set(store.positions.map((position) => position.asOf))].sort().reverse();
}

/**
 * The period an `asOf` request answers over: the latest period on or before the requested
 * date, or the latest of all when no date was given. Null when nothing qualifies.
 */
export function resolvePeriod(store: TripleStore, asOf?: string | null): string | null {
  const all = periods(store);
  if (!asOf) return all[0] ?? null;
  return all.find((period) => period <= asOf) ?? null;
}

/* --------------------------------------------------------------- ownership */

/**
 * Entity ids whose ownership fraction a path needs: a parent step is reached by owning the
 * step before it, a subsidiary step by owning that step itself.
 */
export function ownedOn(path: PathStep[]): string[] {
  const owned: string[] = [];
  for (let i = 1; i < path.length; i += 1) {
    if (path[i].hop === 'parent') owned.push(path[i - 1].id);
    else if (path[i].hop === 'subsidiary') owned.push(path[i].id);
  }
  return owned;
}

/** Product of the fractions on the lineage hops of a path; an entity with no parent counts whole. */
export function ownershipWeight(store: TripleStore, path: PathStep[]): number {
  let weight = 1;
  for (const id of ownedOn(path)) {
    const entity = store.entity(id);
    weight *= entity && entity.parent ? entity.ownership : 1;
  }
  return weight;
}

export function ref(store: TripleStore, id: string): EntityRef {
  const entity = store.entity(id);
  if (!entity) throw new Error(`entity not found: ${id}`);
  return { id: entity.id, name: entity.name, kinds: entity.kinds };
}

/* ----------------------------------------------------------------- lineage */

/** Ancestors nearest first, at most `depth` of them. */
export function ancestors(store: TripleStore, id: string, depth: number): EntityRef[] {
  const chain: EntityRef[] = [];
  let cursor = store.entity(id);
  while (chain.length < depth && cursor?.parent) {
    const parent = store.entity(cursor.parent);
    if (!parent) break;
    chain.push({ id: parent.id, name: parent.name, kinds: parent.kinds });
    cursor = parent;
  }
  return chain;
}

/** Every entity reachable by `subsidiaryOf` within `depth` hops, child first. */
export function descendantIds(store: TripleStore, id: string, depth: number): string[] {
  const seen = new Set<string>();
  let frontier = [id];
  for (let level = 0; level < depth && frontier.length > 0; level += 1) {
    const next: string[] = [];
    for (const parent of frontier) {
      for (const child of store.children(parent)) {
        if (!seen.has(child)) {
          seen.add(child);
          next.push(child);
        }
      }
    }
    frontier = next;
  }
  return [...seen];
}

function descendantTree(store: TripleStore, id: string, depth: number): LineageNode {
  const entity = store.entity(id);
  if (!entity) throw new Error(`entity not found: ${id}`);
  const node: LineageNode = {
    id: entity.id,
    name: entity.name,
    kinds: entity.kinds,
    jurisdiction: entity.jurisdiction,
    depth: 0,
    children: [],
  };
  const attach = (parent: LineageNode): void => {
    if (parent.depth >= depth) return;
    const children = store.children(parent.id)
      .map((childId) => store.entity(childId))
      .filter((child): child is NonNullable<typeof child> => child !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      const childNode: LineageNode = {
        id: child.id,
        name: child.name,
        kinds: child.kinds,
        jurisdiction: child.jurisdiction,
        depth: parent.depth + 1,
        children: [],
      };
      parent.children.push(childNode);
      attach(childNode);
    }
  };
  attach(node);
  return node;
}

function treeSize(node: LineageNode): number {
  return node.children.reduce((total, child) => total + treeSize(child), 1);
}

function treeDepth(node: LineageNode): number {
  return node.children.reduce((deepest, child) => Math.max(deepest, treeDepth(child)), node.depth);
}

export function lineage(store: TripleStore, id: string, depth = MAX_DEPTH): LineageResponse {
  const started = performance.now();
  const capped = clampDepth(depth);
  const self = ref(store, id);
  const chain = ancestors(store, id, capped);
  const tree = descendantTree(store, id, capped);
  return {
    entity: self,
    ancestors: chain,
    ultimateParent: chain.length === 0 ? self : chain[chain.length - 1],
    descendants: tree,
    maxDepth: capped,
    descendantCount: treeSize(tree) - 1,
    deepestLevel: treeDepth(tree),
    queryMillis: performance.now() - started,
  };
}

/* ---------------------------------------------------------------- exposure */

/**
 * The root of the fund's family: the first entity on `fund` then its ancestors that has
 * no parent of its own. `exposure.rq` finds it with a bounded path followed by
 * `FILTER NOT EXISTS { ?root tg:subsidiaryOf ?above }`, so a chain longer than the depth
 * budget leaves no root and the answer is empty.
 */
function familyRoot(store: TripleStore, fundId: string, depth: number): string | null {
  const candidates = [fundId, ...ancestors(store, fundId, depth).map((a) => a.id)];
  for (const id of candidates) {
    if (store.entity(id)?.parent === null) return id;
  }
  return null;
}

function explain(path: PathStep[], instrument: Instrument): string {
  let sentence = path[0].name;
  for (let i = 1; i < path.length; i += 1) {
    const step = path[i];
    switch (step.hop) {
      case 'parent':
        sentence += ` is a subsidiary of ${step.name}`;
        break;
      case 'subsidiary':
        sentence += `, whose subsidiary ${step.name}`;
        break;
      case 'holds':
        sentence += ` holds ${instrument.instrumentClass}`
          + `${instrument.ticker !== null ? ` ${instrument.ticker}` : ''}`
          + ` issued by ${step.name}`;
        break;
      default:
        sentence += ` ${step.name}`;
    }
  }
  return sentence;
}

/** fund -(parent)*-> root -(subsidiary)*-> holder -(holds)-> issuerEntity -(parent)*-> issuer. */
export function buildPath(
  store: TripleStore,
  fund: EntityRef,
  holder: EntityRef,
  issuerEntity: EntityRef,
  issuer: EntityRef,
  depth: number,
): PathStep[] {
  const path: PathStep[] = [{ id: fund.id, name: fund.name, hop: 'start' }];
  if (holder.id !== fund.id) {
    const up = ancestors(store, fund.id, depth);
    const holderUp = ancestors(store, holder.id, depth);
    const root = up.length === 0 ? fund.id : up[up.length - 1].id;
    for (const step of up) {
      path.push({ id: step.id, name: step.name, hop: 'parent' });
      if (step.id === root) break;
    }
    if (holder.id !== root) {
      let rootIndex = holderUp.findIndex((a) => a.id === root);
      if (rootIndex < 0) rootIndex = holderUp.length;
      for (let i = rootIndex - 1; i >= 0; i -= 1) {
        path.push({ id: holderUp[i].id, name: holderUp[i].name, hop: 'subsidiary' });
      }
      path.push({ id: holder.id, name: holder.name, hop: 'subsidiary' });
    }
  }
  path.push({ id: issuerEntity.id, name: issuerEntity.name, hop: 'holds' });
  if (issuerEntity.id !== issuer.id) {
    for (const step of ancestors(store, issuerEntity.id, depth)) {
      path.push({ id: step.id, name: step.name, hop: 'parent' });
      if (step.id === issuer.id) break;
    }
  }
  return path;
}

export function exposure(
  store: TripleStore,
  fundId: string,
  issuerId: string,
  options: ExposureOptions = {},
): ExposureResponse {
  const started = performance.now();
  const includeAffiliates = options.includeAffiliates ?? true;
  const includeSubsidiaries = options.includeSubsidiaries ?? true;
  const weighted = options.weighted ?? false;
  const depth = clampDepth(options.depth, EXPOSURE_MAX_DEPTH);
  const period = resolvePeriod(store, options.asOf);
  const fund = ref(store, fundId);
  const issuer = ref(store, issuerId);

  // holderClause: the fund alone, or every Fund in the family of its ultimate parent.
  let holders: Set<string>;
  if (!includeAffiliates) {
    holders = new Set([fundId]);
  } else {
    const root = familyRoot(store, fundId, depth);
    holders = new Set<string>();
    if (root !== null) {
      for (const id of [root, ...descendantIds(store, root, depth)]) {
        if (store.entity(id)?.kinds.includes('Fund')) holders.add(id);
      }
    }
  }

  // issuerClause: the issuer alone, or the issuer plus its subsidiaries within depth.
  const issuerEntities = includeSubsidiaries
    ? new Set([issuerId, ...descendantIds(store, issuerId, depth)])
    : new Set([issuerId]);

  // GROUP BY ?holder ?issuerEntity ?instrument, SUM(?v), SUM(?q), COUNT(?pos), MAX(?d).
  interface Group {
    holder: string; issuerEntity: string; cusip: string;
    value: number; quantity: number; positions: number; asOf: string;
  }
  const groups = new Map<string, Group>();
  for (const holderId of holders) {
    for (const position of store.heldBy.get(holderId) ?? []) {
      if (!issuerEntities.has(position.issuer)) continue;
      if (position.asOf !== period) continue;
      const key = `${position.holder} ${position.issuer} ${position.cusip}`;
      const group = groups.get(key);
      if (group) {
        group.value += position.value;
        group.quantity += position.quantity;
        group.positions += 1;
        if (position.asOf > group.asOf) group.asOf = position.asOf;
      } else {
        groups.set(key, {
          holder: position.holder,
          issuerEntity: position.issuer,
          cusip: position.cusip,
          value: position.value,
          quantity: position.quantity,
          positions: 1,
          asOf: position.asOf,
        });
      }
    }
  }

  // ORDER BY DESC(?value); ties broken by holder then CUSIP so the order is stable.
  const ordered = [...groups.values()].sort((a, b) => (b.value - a.value)
    || a.holder.localeCompare(b.holder)
    || a.cusip.localeCompare(b.cusip));

  const byInstrument: ExposureLine[] = [];
  const byHolder = new Map<string, HolderTotal>();
  let totalValue = 0;
  let directValue = 0;
  let viaSubsidiariesValue = 0;
  let viaAffiliatesValue = 0;
  let positions = 0;
  let longestPath = 0;

  for (const group of ordered) {
    const instrumentNode = store.instruments.get(group.cusip);
    const instrument: Instrument = {
      cusip: group.cusip,
      ticker: instrumentNode?.ticker ?? null,
      instrumentClass: instrumentNode?.instrumentClass ?? '',
    };
    const holder = ref(store, group.holder);
    const issuerEntity = ref(store, group.issuerEntity);
    const viaAffiliate = holder.id !== fund.id;
    const viaSubsidiary = issuerEntity.id !== issuer.id;
    const path = buildPath(store, fund, holder, issuerEntity, issuer, depth);
    // Weighting multiplies a line by the ownership along its path, and the answer is then
    // ordered by what is left rather than by the reported value.
    const weight = weighted ? ownershipWeight(store, path) : null;
    const line: ExposureLine = {
      instrument,
      holder,
      issuerEntity,
      value: group.value,
      quantity: group.quantity,
      positions: group.positions,
      asOf: group.asOf,
      direct: !viaAffiliate && !viaSubsidiary,
      viaAffiliate,
      viaSubsidiary,
      pathLength: path.length - 1,
      lineagePath: path,
      explanation: explain(path, instrument),
      weight,
      weightedValue: weight === null ? null : Math.round(group.value * weight * 100) / 100,
    };
    byInstrument.push(line);
  }

  if (weighted) {
    byInstrument.sort((a, b) => (b.weightedValue ?? 0) - (a.weightedValue ?? 0)
      || a.holder.id.localeCompare(b.holder.id)
      || a.instrument.cusip.localeCompare(b.instrument.cusip));
  }

  for (const line of byInstrument) {
    const value = weighted ? line.weightedValue ?? 0 : line.value;
    totalValue += value;
    positions += line.positions;
    longestPath = Math.max(longestPath, line.pathLength);
    if (line.direct) directValue += value;
    else if (line.viaSubsidiary && !line.viaAffiliate) viaSubsidiariesValue += value;
    else viaAffiliatesValue += value;

    const running = byHolder.get(line.holder.id);
    if (running) {
      running.value += value;
      running.positions += line.positions;
    } else {
      byHolder.set(line.holder.id, { holder: line.holder, value, positions: line.positions });
    }
  }

  return {
    fund,
    issuer,
    asOf: period,
    totalValue,
    directValue,
    viaSubsidiariesValue,
    viaAffiliatesValue,
    positions,
    includeAffiliates,
    includeSubsidiaries,
    weighted,
    maxDepth: depth,
    longestPath,
    byInstrument,
    byHolder: [...byHolder.values()].sort((a, b) => b.value - a.value),
    queryMillis: performance.now() - started,
  };
}

/* --------------------------------------------------------------- neighbors */

const REL_ORDER = ['HELD_BY', 'HOLDS', 'PARENT', 'SUBSIDIARY'] as const;
/** neighbors.rq ranks lineage ahead of holdings with ?prio, so the limit drops holdings. */
const REL_PRIO: Record<Rel, number> = { PARENT: 0, SUBSIDIARY: 0, HOLDS: 1, HELD_BY: 1 };
type Rel = typeof REL_ORDER[number];

export function neighbors(store: TripleStore, id: string, limit = 40): NeighborGraph {
  const center = ref(store, id);
  const capped = Math.min(Math.max(Math.trunc(limit), 1), 200);
  const rows: { other: string; name: string; rel: Rel; weight: number }[] = [];

  const entity = store.entity(id);
  if (entity?.parent) {
    const parent = store.entity(entity.parent);
    if (parent) rows.push({ other: parent.id, name: parent.name, rel: 'PARENT', weight: 0 });
  }
  for (const childId of store.children(id)) {
    const child = store.entity(childId);
    if (child) rows.push({ other: child.id, name: child.name, rel: 'SUBSIDIARY', weight: 0 });
  }
  const sumBy = (list: PositionNode[], pick: (p: PositionNode) => string): Map<string, number> => {
    const totals = new Map<string, number>();
    for (const position of list) {
      const key = pick(position);
      totals.set(key, (totals.get(key) ?? 0) + position.value);
    }
    return totals;
  };
  for (const [otherId, weight] of sumBy(store.heldBy.get(id) ?? [], (p) => p.issuer)) {
    const other = store.entity(otherId);
    if (other) rows.push({ other: other.id, name: other.name, rel: 'HOLDS', weight });
  }
  for (const [otherId, weight] of sumBy(store.issuedBy.get(id) ?? [], (p) => p.holder)) {
    const other = store.entity(otherId);
    if (other) rows.push({ other: other.id, name: other.name, rel: 'HELD_BY', weight });
  }

  // ORDER BY ?prio DESC(?weight) ?otherName LIMIT n.
  rows.sort((a, b) => (REL_PRIO[a.rel] - REL_PRIO[b.rel])
    || (b.weight - a.weight)
    || a.name.localeCompare(b.name));

  const nodes = new Map<string, NeighborNode>([[center.id, { ...center }]]);
  const links: NeighborLink[] = [];
  for (const row of rows.slice(0, capped)) {
    if (!nodes.has(row.other)) {
      const other = store.entity(row.other);
      if (other) nodes.set(other.id, { id: other.id, name: other.name, kinds: other.kinds });
    }
    const outgoing = row.rel === 'PARENT' || row.rel === 'HOLDS';
    links.push({
      source: outgoing ? center.id : row.other,
      target: outgoing ? row.other : center.id,
      rel: row.rel === 'PARENT' || row.rel === 'SUBSIDIARY' ? 'subsidiaryOf' : 'holds',
      weight: row.weight,
    });
  }
  return { center: center.id, nodes: [...nodes.values()], links };
}

/** Merge an expansion into a graph already on screen, keeping the original centre. */
export function mergeGraphs(base: NeighborGraph, addition: NeighborGraph): NeighborGraph {
  const nodes = new Map(base.nodes.map((node) => [node.id, node]));
  for (const node of addition.nodes) if (!nodes.has(node.id)) nodes.set(node.id, node);
  const links = [...base.links];
  const seen = new Set(links.map((l) => `${l.source} ${l.target} ${l.rel}`));
  for (const link of addition.links) {
    const key = `${link.source} ${link.target} ${link.rel}`;
    if (!seen.has(key)) {
      seen.add(key);
      links.push(link);
    }
  }
  return { center: base.center, nodes: [...nodes.values()], links };
}

/* ------------------------------------------------------------------ search */

export function search(store: TripleStore, q: string, limit = 20): EntitySummary[] {
  const query = q.trim();
  if (query.length < 2) throw new Error('q must be at least 2 characters');
  const lower = query.toLowerCase();
  const matches = [...store.entities.values()].filter((entity) => entity.name.toLowerCase().includes(lower)
    || entity.ticker?.toLowerCase() === lower
    || entity.cik === query);
  matches.sort((a, b) => {
    const aTicker = a.ticker?.toLowerCase() === lower ? 1 : 0;
    const bTicker = b.ticker?.toLowerCase() === lower ? 1 : 0;
    return (bTicker - aTicker) || (a.name.length - b.name.length) || a.name.localeCompare(b.name);
  });
  return matches.slice(0, Math.max(1, Math.trunc(limit))).map((entity) => ({
    id: entity.id,
    name: entity.name,
    kinds: entity.kinds,
    ticker: entity.ticker,
    cik: entity.cik,
  }));
}

/* ------------------------------------------------------------------ trades */

export function trades(
  store: TripleStore,
  entityId: string,
  limit = 20,
  offset = 0,
  asOf?: string | null,
): TradeRecord[] {
  const period = resolvePeriod(store, asOf);
  const held = store.heldBy.get(entityId) ?? [];
  const issued = store.issuedBy.get(entityId) ?? [];
  const unique = new Map<string, PositionNode>();
  for (const position of [...held, ...issued]) {
    if (position.asOf === period) unique.set(position.iri, position);
  }
  const ordered = [...unique.values()]
    .sort((a, b) => (b.value - a.value) || a.iri.localeCompare(b.iri))
    .slice(offset, offset + limit);
  return ordered.map((position) => {
    const instrument = store.instruments.get(position.cusip);
    const filing = store.filings.get(position.filing);
    return {
      position: position.iri,
      holder: ref(store, position.holder),
      issuer: ref(store, position.issuer),
      instrument: {
        cusip: position.cusip,
        ticker: instrument?.ticker ?? null,
        instrumentClass: instrument?.instrumentClass ?? '',
      },
      quantity: position.quantity,
      value: position.value,
      asOf: position.asOf,
      accession: position.filing,
      formType: filing?.formType ?? '',
    };
  });
}

/* ----------------------------------------------------------- concentration */

/**
 * Where a fund family's value sits: its positions grouped by the issuer each one names,
 * with the share of the family total, cut off at `minShare`. Mirrors concentration.rq and
 * ConcentrationService, which applies the share and the cut off after the query so one set
 * of rows answers any threshold.
 */
export function concentration(
  store: TripleStore,
  entityId: string,
  limit = 10,
  minShare = DEFAULT_MIN_SHARE,
  asOf?: string | null,
): ConcentrationResponse {
  const started = performance.now();
  if (minShare < 0 || minShare > 1) throw new Error('minShare must be between 0 and 1');
  const entity = ref(store, entityId);
  const period = resolvePeriod(store, asOf);
  const depth = clampDepth(undefined, EXPOSURE_MAX_DEPTH);

  const root = familyRoot(store, entityId, depth);
  const holders = new Set<string>();
  if (root !== null) {
    for (const id of [root, ...descendantIds(store, root, depth)]) {
      if (store.entity(id)?.kinds.includes('Fund')) holders.add(id);
    }
  }

  const totals = new Map<string, { value: number; positions: number }>();
  let totalValue = 0;
  for (const holderId of holders) {
    for (const position of store.heldBy.get(holderId) ?? []) {
      if (position.asOf !== period) continue;
      const running = totals.get(position.issuer);
      if (running) {
        running.value += position.value;
        running.positions += 1;
      } else {
        totals.set(position.issuer, { value: position.value, positions: 1 });
      }
      totalValue += position.value;
    }
  }

  const lines: ConcentrationLine[] = totalValue <= 0 ? [] : [...totals.entries()]
    .map(([id, running]) => ({
      issuer: ref(store, id),
      value: running.value,
      share: running.value / totalValue,
      positions: running.positions,
    }))
    .filter((line) => line.share >= minShare)
    .sort((a, b) => (b.value - a.value) || a.issuer.id.localeCompare(b.issuer.id));

  return {
    entity,
    asOf: period,
    totalValue,
    minShare,
    matches: lines.length,
    byIssuer: lines.slice(0, Math.max(1, Math.trunc(limit))),
    queryMillis: performance.now() - started,
  };
}

/* ------------------------------------------------------------------- stats */

export function stats(store: TripleStore): Stats {
  return {
    entities: store.countByType('LegalEntity'),
    issuers: store.countByType('Issuer'),
    funds: store.countByType('Fund'),
    subsidiaries: store.countByType('Subsidiary'),
    positions: store.countByType('Position'),
    filings: store.countByType('Filing'),
    lineageEdges: store.countByPredicate(`${TG}subsidiaryOf`),
    triples: store.triples.length,
  };
}

/** Classes an entity is asserted to be, straight from the type triples. */
export function assertedTypes(store: TripleStore, id: string): string[] {
  const entity = store.entity(id);
  if (!entity) return [];
  return store.match(entity.iri, RDF_TYPE).map((t) => t.o.replace(TG, 'tg:'));
}
