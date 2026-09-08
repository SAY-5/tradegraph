import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  EntityDetail,
  EntitySummary,
  ExposureOptions,
  ExposureResponse,
  LineageResponse,
  NeighborGraph,
  Stats,
  TradeRecord,
} from './models';

/** Thin client for the TradeGraph API. Requests go through `/api`, proxied to the Spring Boot service. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  readonly base = '/api';

  search(q: string, limit = 12): Observable<EntitySummary[]> {
    const params = new HttpParams().set('q', q).set('limit', limit);
    return this.http.get<EntitySummary[]>(`${this.base}/entities`, { params });
  }

  entity(id: string): Observable<EntityDetail> {
    return this.http.get<EntityDetail>(`${this.base}/entities/${encodeURIComponent(id)}`);
  }

  lineage(id: string, depth?: number): Observable<LineageResponse> {
    let params = new HttpParams();
    if (depth !== undefined) {
      params = params.set('depth', depth);
    }
    return this.http.get<LineageResponse>(`${this.base}/entities/${encodeURIComponent(id)}/lineage`, { params });
  }

  exposure(fundId: string, issuerId: string, options: ExposureOptions = {}): Observable<ExposureResponse> {
    let params = new HttpParams().set('issuer', issuerId);
    if (options.includeAffiliates !== undefined) {
      params = params.set('includeAffiliates', options.includeAffiliates);
    }
    if (options.includeSubsidiaries !== undefined) {
      params = params.set('includeSubsidiaries', options.includeSubsidiaries);
    }
    if (options.depth !== undefined) {
      params = params.set('depth', options.depth);
    }
    return this.http.get<ExposureResponse>(`${this.base}/entities/${encodeURIComponent(fundId)}/exposure`, {
      params,
    });
  }

  trades(entityId: string, limit = 25): Observable<TradeRecord[]> {
    const params = new HttpParams().set('entity', entityId).set('limit', limit);
    return this.http.get<TradeRecord[]>(`${this.base}/trades`, { params });
  }

  neighbors(id: string, limit = 30): Observable<NeighborGraph> {
    const params = new HttpParams().set('limit', limit);
    return this.http.get<NeighborGraph>(`${this.base}/graph/neighbors/${encodeURIComponent(id)}`, { params });
  }

  stats(): Observable<Stats> {
    return this.http.get<Stats>(`${this.base}/stats`);
  }
}
