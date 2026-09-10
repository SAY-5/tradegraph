export interface EntityRef {
  id: string;
  name: string;
  kinds: string[];
}

export interface EntitySummary {
  id: string;
  name: string;
  ticker?: string;
  cik?: string;
  kinds: string[];
}

export interface EntityDetail {
  id: string;
  name: string;
  kinds: string[];
  ticker?: string;
  cik?: string;
  lei?: string;
  jurisdiction?: string;
  parent?: EntityRef;
  subsidiaries: number;
  positionsHeld: number;
  valueHeld: number;
  positionsIssued: number;
  valueIssued: number;
}

export interface LineageNode {
  id: string;
  name: string;
  kinds: string[];
  jurisdiction?: string;
  depth: number;
  children: LineageNode[];
}

export interface LineageResponse {
  entity: EntityRef;
  ancestors: EntityRef[];
  ultimateParent: EntityRef;
  descendants: LineageNode;
  maxDepth: number;
  descendantCount: number;
  deepestLevel: number;
  queryMillis: number;
}

export interface Instrument {
  cusip: string;
  ticker?: string;
  instrumentClass: string;
}

export interface PathStep {
  id: string;
  name: string;
  hop: 'start' | 'parent' | 'subsidiary' | 'holds';
}

export interface ExposureLine {
  instrument: Instrument;
  holder: EntityRef;
  issuerEntity: EntityRef;
  value: number;
  quantity: number;
  positions: number;
  asOf?: string;
  direct: boolean;
  viaAffiliate: boolean;
  viaSubsidiary: boolean;
  pathLength: number;
  lineagePath: PathStep[];
  explanation: string;
  weight?: number;
  weightedValue?: number;
}

export interface HolderTotal {
  holder: EntityRef;
  value: number;
  positions: number;
}

export interface ExposureResponse {
  fund: EntityRef;
  issuer: EntityRef;
  asOf?: string;
  totalValue: number;
  directValue: number;
  viaSubsidiariesValue: number;
  viaAffiliatesValue: number;
  positions: number;
  includeAffiliates: boolean;
  includeSubsidiaries: boolean;
  weighted: boolean;
  maxDepth: number;
  longestPath: number;
  byInstrument: ExposureLine[];
  byHolder: HolderTotal[];
  queryMillis: number;
}

export interface TradeRecord {
  id: string;
  holder: EntityRef;
  issuer: EntityRef;
  instrument: Instrument;
  quantity: number;
  value: number;
  asOf: string;
  accessionNumber: string;
  formType: string;
}

export interface GraphNode {
  id: string;
  name: string;
  kinds: string[];
}

export interface GraphLink {
  source: string;
  target: string;
  rel: 'subsidiaryOf' | 'holds';
  weight: number;
}

export interface NeighborGraph {
  center: string;
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface Stats {
  store: string;
  entities: number;
  issuers: number;
  funds: number;
  subsidiaries: number;
  positions: number;
  filings: number;
  lineageEdges: number;
  triples: number;
  queryMillis: number;
}

export interface ExposureOptions {
  includeAffiliates?: boolean;
  includeSubsidiaries?: boolean;
  depth?: number;
  asOf?: string;
  weighted?: boolean;
}

/** Merge a neighbour expansion into an existing graph without duplicating nodes or links. */
export function mergeGraphs(base: NeighborGraph, extra: NeighborGraph): NeighborGraph {
  const nodes = new Map(base.nodes.map((n) => [n.id, n]));
  for (const n of extra.nodes) {
    if (!nodes.has(n.id)) {
      nodes.set(n.id, n);
    }
  }
  const key = (l: GraphLink) => `${l.source}|${l.target}|${l.rel}`;
  const links = new Map(base.links.map((l) => [key(l), l]));
  for (const l of extra.links) {
    if (!links.has(key(l))) {
      links.set(key(l), l);
    }
  }
  return { center: base.center, nodes: [...nodes.values()], links: [...links.values()] };
}
