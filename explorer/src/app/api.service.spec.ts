import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiService } from './api.service';

describe('ApiService', () => {
  let api: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('searches with query and limit', () => {
    api.search('acme', 5).subscribe();
    const req = http.expectOne((r) => r.url === '/api/entities');
    expect(req.request.params.get('q')).toBe('acme');
    expect(req.request.params.get('limit')).toBe('5');
    req.flush([]);
  });

  it('builds exposure requests with optional flags', () => {
    api.exposure('F00000201', '0000000001', { includeAffiliates: false, depth: 2 }).subscribe();
    const req = http.expectOne((r) => r.url === '/api/entities/F00000201/exposure');
    expect(req.request.params.get('issuer')).toBe('0000000001');
    expect(req.request.params.get('includeAffiliates')).toBe('false');
    expect(req.request.params.get('includeSubsidiaries')).toBeNull();
    expect(req.request.params.get('depth')).toBe('2');
    req.flush({});
  });

  it('encodes entity ids in paths', () => {
    api.lineage('S 1').subscribe();
    http.expectOne('/api/entities/S%201/lineage').flush({});
  });
});
