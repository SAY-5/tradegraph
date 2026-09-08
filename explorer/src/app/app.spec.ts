import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('renders the header and store stats', async () => {
    const fixture = TestBed.createComponent(App);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/stats').flush({
      store: 'fuseki', entities: 6100, issuers: 3600, funds: 410, subsidiaries: 2148,
      positions: 12373, filings: 829, lineageEdges: 2500, triples: 207095, queryMillis: 5,
    });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.title')?.textContent).toContain('TradeGraph Explorer');
    expect(el.querySelector('.stats')?.textContent).toContain('6,100 entities');
  });
});
