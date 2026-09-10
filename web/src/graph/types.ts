/** Shapes shared by the triple store and the query functions. */

export type Kind = 'Issuer' | 'Fund' | 'Subsidiary';

export interface EntityNode {
  id: string;
  iri: string;
  name: string;
  kinds: Kind[];
  ticker: string | null;
  cik: string | null;
  jurisdiction: string | null;
  parent: string | null;
  filing: string | null;
}

export interface FilingNode {
  accession: string;
  iri: string;
  formType: string;
  filer: string;
  period: string;
}

export interface InstrumentNode {
  cusip: string;
  iri: string;
  instrumentClass: string;
  ticker: string | null;
  issuer: string;
  name: string;
}

export interface PositionNode {
  iri: string;
  filing: string;
  index: number;
  holder: string;
  issuer: string;
  cusip: string;
  quantity: number;
  value: number;
  asOf: string;
}

export interface Triple {
  s: string;
  p: string;
  o: string;
  /** true when the object is a literal rather than an IRI. */
  literal: boolean;
}

export interface EntityRef {
  id: string;
  name: string;
  kinds: Kind[];
}

export interface EntitySummary extends EntityRef {
  ticker: string | null;
  cik: string | null;
}

export interface Instrument {
  cusip: string;
  ticker: string | null;
  instrumentClass: string;
}

/** How a step was reached from the previous one; mirrors the API's PathStep. */
export type Hop = 'start' | 'parent' | 'subsidiary' | 'holds';

export interface PathStep {
  id: string;
  name: string;
  hop: Hop;
}

export interface ExposureLine {
  instrument: Instrument;
  holder: EntityRef;
  issuerEntity: EntityRef;
  value: number;
  quantity: number;
  positions: number;
  asOf: string;
  direct: boolean;
  viaAffiliate: boolean;
  viaSubsidiary: boolean;
  pathLength: number;
  lineagePath: PathStep[];
  explanation: string;
}

export interface HolderTotal {
  holder: EntityRef;
  value: number;
  positions: number;
}

export interface ExposureResponse {
  fund: EntityRef;
  issuer: EntityRef;
  totalValue: number;
  directValue: number;
  viaSubsidiariesValue: number;
  viaAffiliatesValue: number;
  positions: number;
  includeAffiliates: boolean;
  includeSubsidiaries: boolean;
  maxDepth: number;
  longestPath: number;
  byInstrument: ExposureLine[];
  byHolder: HolderTotal[];
  queryMillis: number;
}

export interface ExposureOptions {
  includeAffiliates?: boolean;
  includeSubsidiaries?: boolean;
  depth?: number;
}

export interface LineageNode {
  id: string;
  name: string;
  kinds: Kind[];
  jurisdiction: string | null;
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

export type NeighborRelation = 'subsidiaryOf' | 'holds';

export interface NeighborNode {
  id: string;
  name: string;
  kinds: Kind[];
}

export interface NeighborLink {
  source: string;
  target: string;
  rel: NeighborRelation;
  weight: number;
}

export interface NeighborGraph {
  center: string;
  nodes: NeighborNode[];
  links: NeighborLink[];
}

export interface TradeRecord {
  position: string;
  holder: EntityRef;
  issuer: EntityRef;
  instrument: Instrument;
  quantity: number;
  value: number;
  asOf: string;
  accession: string;
  formType: string;
}

export interface Stats {
  entities: number;
  issuers: number;
  funds: number;
  subsidiaries: number;
  positions: number;
  filings: number;
  lineageEdges: number;
  triples: number;
}
