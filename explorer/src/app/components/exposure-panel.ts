import { Component, computed, inject, input, output, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe, PercentPipe } from '@angular/common';
import { ApiService } from '../api.service';
import { EntityRef, EntitySummary, ExposureLine, ExposureOptions, ExposureResponse } from '../models';
import { SearchBar } from './search-bar';

@Component({
  selector: 'tg-exposure-panel',
  imports: [CurrencyPipe, DecimalPipe, PercentPipe, SearchBar],
  template: `
    <h2>Exposure</h2>
    <div class="pick">
      <div class="who">
        <span class="muted">Fund</span>
        <span>{{ fund()?.name || 'select a fund' }}</span>
      </div>
      <div class="who">
        <span class="muted">Issuer</span>
        <span>{{ issuer()?.name || 'search for an issuer' }}</span>
      </div>
      <tg-search-bar (picked)="pickIssuer($event)" />
      <div class="opts">
        <label><input type="checkbox" [checked]="includeAffiliates()" (change)="toggle('affiliates')" /> affiliates</label>
        <label><input type="checkbox" [checked]="includeSubsidiaries()" (change)="toggle('subsidiaries')" /> subsidiaries</label>
        <label><input type="checkbox" [checked]="weighted()" (change)="toggle('weighted')" /> weighted</label>
        <label>depth <input type="number" min="1" max="6" [value]="depth()" (change)="setDepth($any($event.target).value)" /></label>
        <label>period
          <select [value]="asOf()" (change)="setPeriod($any($event.target).value)">
            <option value="">latest</option>
            @for (period of periods(); track period) {
              <option [value]="period">{{ period }}</option>
            }
          </select>
        </label>
        <button (click)="run()" [disabled]="!fund() || !issuer()">Run</button>
      </div>
    </div>

    @if (error()) {
      <p class="error">{{ error() }}</p>
    }

    @if (result(); as r) {
      <div class="totals">
        <div class="total">
          <span class="muted">Total</span>
          <strong class="mono">{{ r.totalValue | currency: 'USD' : 'symbol' : '1.0-0' }}</strong>
        </div>
        <div class="total">
          <span class="muted">Direct</span>
          <span class="mono">{{ r.directValue | currency: 'USD' : 'symbol' : '1.0-0' }}</span>
        </div>
        <div class="total">
          <span class="muted">Via subsidiaries</span>
          <span class="mono">{{ r.viaSubsidiariesValue | currency: 'USD' : 'symbol' : '1.0-0' }}</span>
        </div>
        <div class="total">
          <span class="muted">Via affiliates</span>
          <span class="mono">{{ r.viaAffiliatesValue | currency: 'USD' : 'symbol' : '1.0-0' }}</span>
        </div>
      </div>
      <p class="muted summary">
        as of {{ r.asOf || 'no filed period' }},
        {{ r.positions | number }} positions, {{ r.byInstrument.length }} instrument lines,
        {{ r.byHolder.length }} holders, longest path {{ r.longestPath }} hops,
        <span class="mono">{{ r.queryMillis }} ms</span>
      </p>
      @if (r.byInstrument.length) {
        <div class="scroll">
        <table>
          <thead>
            <tr>
              <th>Instrument</th>
              <th>Holder</th>
              <th class="num">Value</th>
              <th class="num">Path</th>
            </tr>
          </thead>
          <tbody>
            @for (line of r.byInstrument; track line.instrument.cusip + line.holder.id) {
              <tr (click)="selected.set(line === selected() ? null : line)" [class.active]="line === selected()">
                <td>
                  <span class="mono">{{ line.instrument.ticker || line.instrument.cusip }}</span>
                  <span class="muted"> {{ line.instrument.instrumentClass }}</span>
                  @if (line.viaSubsidiary) {
                    <div class="muted small">issued by {{ line.issuerEntity.name }}</div>
                  }
                </td>
                <td>
                  <button class="link" (click)="navigate.emit(line.holder.id); $event.stopPropagation()">
                    {{ line.holder.name }}
                  </button>
                </td>
                <td class="num">
                  {{ (line.weightedValue ?? line.value) | currency: 'USD' : 'symbol' : '1.0-0' }}
                  @if (line.weight !== undefined) {
                    <div class="muted small">{{ line.weight | percent: '1.0-1' }} owned</div>
                  }
                </td>
                <td class="num">{{ line.pathLength }}</td>
              </tr>
              @if (line === selected()) {
                <tr class="detail">
                  <td colspan="4">
                    <div class="path">
                      @for (step of line.lineagePath; track $index) {
                        @if ($index > 0) {
                          <span class="hop muted">{{ step.hop }}</span>
                        }
                        <button class="link" (click)="navigate.emit(step.id)">{{ step.name }}</button>
                      }
                    </div>
                    <p class="muted small">{{ line.explanation }}</p>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
        </div>
      } @else {
        <p class="muted">No exposure found for this pair.</p>
      }
    }
  `,
  styles: `
    .pick { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
    .who { display: flex; gap: 8px; }
    .who .muted { width: 50px; }
    .opts { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .opts label { display: flex; gap: 4px; align-items: center; color: var(--muted); }
    .opts input[type='number'] { width: 56px; padding: 3px 6px; }
    .opts select { padding: 3px 6px; }
    .totals { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .total { display: flex; flex-direction: column; background: var(--panel-2); border-radius: 6px; padding: 8px 10px; }
    .total strong { font-size: 16px; }
    .total span, .total strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .summary { margin: 8px 0; font-size: 12px; }
    tbody tr { cursor: pointer; }
    tbody tr.active td { background: var(--panel-2); }
    tr.detail td { background: var(--panel-2); }
    .path { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .hop { font-size: 11px; border: 1px solid var(--border); border-radius: 4px; padding: 0 5px; }
    .small { font-size: 12px; margin: 4px 0 0; }
    .error { color: var(--danger); }
    .scroll { overflow-x: auto; }
  `,
})
export class ExposurePanel {
  private readonly api = inject(ApiService);

  readonly fund = input<EntityRef | null>(null);
  readonly navigate = output<string>();

  readonly issuer = signal<EntityRef | null>(null);
  readonly includeAffiliates = signal(true);
  readonly includeSubsidiaries = signal(true);
  readonly depth = signal(4);
  readonly weighted = signal(false);
  readonly periods = signal<string[]>([]);
  readonly asOf = signal('');
  readonly result = signal<ExposureResponse | null>(null);
  readonly error = signal<string | null>(null);
  readonly selected = signal<ExposureLine | null>(null);

  readonly options = computed<ExposureOptions>(() => ({
    includeAffiliates: this.includeAffiliates(),
    includeSubsidiaries: this.includeSubsidiaries(),
    depth: this.depth(),
    asOf: this.asOf() || undefined,
    weighted: this.weighted(),
  }));

  constructor() {
    this.api.periods().subscribe({ next: (p) => this.periods.set(p), error: () => this.periods.set([]) });
  }

  pickIssuer(e: EntitySummary): void {
    this.issuer.set({ id: e.id, name: e.name, kinds: e.kinds });
    this.run();
  }

  toggle(which: 'affiliates' | 'subsidiaries' | 'weighted'): void {
    if (which === 'affiliates') {
      this.includeAffiliates.update((v) => !v);
    } else if (which === 'subsidiaries') {
      this.includeSubsidiaries.update((v) => !v);
    } else {
      this.weighted.update((v) => !v);
      this.run();
    }
  }

  setPeriod(value: string): void {
    this.asOf.set(value);
    this.run();
  }

  setDepth(value: string): void {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 1) {
      this.depth.set(Math.min(n, 6));
    }
  }

  run(): void {
    const fund = this.fund();
    const issuer = this.issuer();
    if (!fund || !issuer) {
      return;
    }
    this.error.set(null);
    this.api.exposure(fund.id, issuer.id, this.options()).subscribe({
      next: (r) => {
        this.result.set(r);
        this.selected.set(null);
      },
      error: (e: { error?: { detail?: string } }) => this.error.set(e.error?.detail ?? 'exposure query failed'),
    });
  }
}
