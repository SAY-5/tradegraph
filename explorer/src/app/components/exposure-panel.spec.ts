import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ExposurePanel } from './exposure-panel';
import { ExposureResponse } from '../models';

const RESPONSE: ExposureResponse = {
  fund: { id: 'F00000201', name: 'Bigfund Growth Fund', kinds: ['Fund'] },
  issuer: { id: '0000000001', name: 'Acme Corp', kinds: ['Issuer'] },
  asOf: '2024-06-30',
  totalValue: 50250.5,
  directValue: 0,
  viaSubsidiariesValue: 49000.5,
  viaAffiliatesValue: 1250,
  positions: 3,
  includeAffiliates: true,
  includeSubsidiaries: true,
  weighted: false,
  maxDepth: 4,
  longestPath: 4,
  byInstrument: [
    {
      instrument: { cusip: '900000002', instrumentClass: 'DEBT' },
      holder: { id: 'F00000201', name: 'Bigfund Growth Fund', kinds: [] },
      issuerEntity: { id: 'S00000101', name: 'Acme Finance Corp.', kinds: [] },
      value: 49000.5,
      quantity: 50000,
      positions: 1,
      direct: false,
      viaAffiliate: false,
      viaSubsidiary: true,
      pathLength: 2,
      lineagePath: [
        { id: 'F00000201', name: 'Bigfund Growth Fund', hop: 'start' },
        { id: 'S00000101', name: 'Acme Finance Corp.', hop: 'holds' },
        { id: '0000000001', name: 'Acme Corp', hop: 'parent' },
      ],
      explanation: 'Bigfund Growth Fund holds DEBT issued by Acme Finance Corp. is a subsidiary of Acme Corp',
    },
  ],
  byHolder: [{ holder: { id: 'F00000201', name: 'Bigfund Growth Fund', kinds: [] }, value: 49000.5, positions: 1 }],
  queryMillis: 12,
};

describe('ExposurePanel', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExposurePanel],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  function flushPeriods(): void {
    TestBed.inject(HttpTestingController).expectOne('/api/periods').flush(['2024-06-30', '2024-03-31']);
  }

  it('runs the query when an issuer is picked and renders totals and the path', async () => {
    const fixture = TestBed.createComponent(ExposurePanel);
    fixture.componentRef.setInput('fund', { id: 'F00000201', name: 'Bigfund Growth Fund', kinds: ['Fund'] });
    await fixture.whenStable();
    flushPeriods();

    fixture.componentInstance.pickIssuer({ id: '0000000001', name: 'Acme Corp', kinds: ['Issuer'] });
    const http = TestBed.inject(HttpTestingController);
    const req = http.expectOne((r) => r.url === '/api/entities/F00000201/exposure');
    expect(req.request.params.get('issuer')).toBe('0000000001');
    expect(req.request.params.get('includeAffiliates')).toBe('true');
    req.flush(RESPONSE);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.total strong')?.textContent).toContain('$50,251');
    expect(el.textContent).toContain('via subsidiaries'.replace('via', 'Via'));
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1);

    (el.querySelector('tbody tr') as HTMLTableRowElement).click();
    await fixture.whenStable();
    expect(el.querySelectorAll('.path .hop')).toHaveLength(2);
    expect(el.textContent).toContain('is a subsidiary of Acme Corp');
  });

  it('does not query without a fund', () => {
    const fixture = TestBed.createComponent(ExposurePanel);
    fixture.componentInstance.pickIssuer({ id: '0000000001', name: 'Acme Corp', kinds: ['Issuer'] });
    TestBed.inject(HttpTestingController).expectNone((r) => r.url.includes('/exposure'));
    expect(fixture.componentInstance.result()).toBeNull();
  });

  it('asks for weighted values and shows the ownership behind each line', async () => {
    const fixture = TestBed.createComponent(ExposurePanel);
    fixture.componentRef.setInput('fund', { id: 'F00000201', name: 'Bigfund Growth Fund', kinds: ['Fund'] });
    await fixture.whenStable();
    flushPeriods();

    fixture.componentInstance.pickIssuer({ id: '0000000001', name: 'Acme Corp', kinds: ['Issuer'] });
    const http = TestBed.inject(HttpTestingController);
    http.expectOne((r) => r.url.includes('/exposure')).flush(RESPONSE);

    fixture.componentInstance.toggle('weighted');
    const req = http.expectOne((r) => r.url.includes('/exposure'));
    expect(req.request.params.get('weighted')).toBe('true');
    const line = RESPONSE.byInstrument[0];
    req.flush({
      ...RESPONSE,
      weighted: true,
      totalValue: 39200.4,
      byInstrument: [{ ...line, weight: 0.8, weightedValue: 39200.4 }],
    });
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('tbody tr td.num')?.textContent).toContain('$39,200');
    expect(el.textContent).toContain('80% owned');
  });

  it('offers the filed periods and pins the query to the one that is picked', async () => {
    const fixture = TestBed.createComponent(ExposurePanel);
    fixture.componentRef.setInput('fund', { id: 'F00000201', name: 'Bigfund Growth Fund', kinds: ['Fund'] });
    await fixture.whenStable();
    flushPeriods();
    await fixture.whenStable();

    const options = (fixture.nativeElement as HTMLElement).querySelectorAll('select option');
    expect([...options].map((o) => o.textContent?.trim())).toEqual(['latest', '2024-06-30', '2024-03-31']);

    fixture.componentInstance.pickIssuer({ id: '0000000001', name: 'Acme Corp', kinds: ['Issuer'] });
    const http = TestBed.inject(HttpTestingController);
    expect(http.expectOne((r) => r.url.includes('/exposure')).request.params.get('as_of')).toBeNull();

    fixture.componentInstance.setPeriod('2024-03-31');
    expect(http.expectOne((r) => r.url.includes('/exposure')).request.params.get('as_of')).toBe('2024-03-31');
  });
});
