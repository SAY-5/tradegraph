/*
 * The facade the page talks to: one store, one cache, the same method names the REST API
 * exposes. Every call reports whether it was served from the cache and how long it took,
 * which is what the timing badges on the page show.
 */

import sliceJson from '../data/slice.json';
import manifest from '../data/slice-manifest.json';
import { QueryCache } from './cache';
import type { Cached } from './cache';
import * as q from './queries';
import { TripleStore } from './store';
import type { SliceData } from './store';
import type {
  ConcentrationResponse, EntitySummary, ExposureOptions, ExposureResponse, LineageResponse,
  NeighborGraph, Stats, TradeRecord,
} from './types';

export * from './types';
export { TripleStore, shorten, TG, ENTITY_NS, RDF_TYPE } from './store';
export { QueryCache } from './cache';
export type { Cached } from './cache';
export {
  boundedPath, clampDepth, ancestors, descendantIds, buildPath, mergeGraphs, assertedTypes,
  periods, resolvePeriod, ownedOn, ownershipWeight,
  MAX_DEPTH, EXPOSURE_MAX_DEPTH, DEFAULT_MIN_SHARE, SUBSIDIARY_OF,
} from './queries';

export const sliceManifest = manifest;

export class GraphApi {
  readonly store: TripleStore;
  readonly cache = new QueryCache();

  constructor(slice: SliceData = sliceJson as unknown as SliceData) {
    this.store = new TripleStore(slice);
  }

  search(query: string, limit = 20): Cached<EntitySummary[]> {
    return this.cache.run(`search ${query.toLowerCase()} ${limit}`, () => q.search(this.store, query, limit));
  }

  lineage(id: string, depth = q.MAX_DEPTH): Cached<LineageResponse> {
    const capped = q.clampDepth(depth);
    return this.cache.run(`lineage ${id} ${capped}`, () => q.lineage(this.store, id, capped));
  }

  exposure(fundId: string, issuerId: string, options: ExposureOptions = {}): Cached<ExposureResponse> {
    const includeAffiliates = options.includeAffiliates ?? true;
    const includeSubsidiaries = options.includeSubsidiaries ?? true;
    const weighted = options.weighted ?? false;
    const depth = q.clampDepth(options.depth, q.EXPOSURE_MAX_DEPTH);
    const asOf = options.asOf ?? null;
    const key = `exposure ${fundId} ${issuerId} ${includeAffiliates} ${includeSubsidiaries} `
      + `${weighted} ${depth} ${asOf ?? 'latest'}`;
    return this.cache.run(key, () => q.exposure(this.store, fundId, issuerId, {
      includeAffiliates, includeSubsidiaries, weighted, depth, asOf,
    }));
  }

  concentration(
    entityId: string,
    limit = 10,
    minShare = q.DEFAULT_MIN_SHARE,
    asOf: string | null = null,
  ): Cached<ConcentrationResponse> {
    const key = `concentration ${entityId} ${limit} ${minShare} ${asOf ?? 'latest'}`;
    return this.cache.run(key, () => q.concentration(this.store, entityId, limit, minShare, asOf));
  }

  periods(): Cached<string[]> {
    return this.cache.run('periods', () => q.periods(this.store));
  }

  neighbors(id: string, limit = 40): Cached<NeighborGraph> {
    return this.cache.run(`neighbors ${id} ${limit}`, () => q.neighbors(this.store, id, limit));
  }

  trades(id: string, limit = 20, offset = 0, asOf: string | null = null): Cached<TradeRecord[]> {
    const key = `trades ${id} ${limit} ${offset} ${asOf ?? 'latest'}`;
    return this.cache.run(key, () => q.trades(this.store, id, limit, offset, asOf));
  }

  stats(): Cached<Stats> {
    return this.cache.run('stats', () => q.stats(this.store));
  }
}

/** One instance for the page; the self check builds its own. */
export const graph = new GraphApi();
