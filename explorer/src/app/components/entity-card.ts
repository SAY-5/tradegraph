import { Component, input, output } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { EntityDetail } from '../models';

@Component({
  selector: 'tg-entity-card',
  imports: [CurrencyPipe, DecimalPipe],
  template: `
    @if (entity(); as e) {
      <div class="head">
        <h1>{{ e.name }}</h1>
        <div class="kinds">
          @for (k of e.kinds; track k) {
            <span [class]="'kind ' + k">{{ k }}</span>
          }
        </div>
      </div>
      <dl>
        @if (e.ticker) {
          <dt>Ticker</dt><dd class="mono">{{ e.ticker }}</dd>
        }
        @if (e.cik) {
          <dt>CIK</dt><dd class="mono">{{ e.cik }}</dd>
        }
        @if (e.lei) {
          <dt>LEI</dt><dd class="mono">{{ e.lei }}</dd>
        }
        @if (e.jurisdiction) {
          <dt>Jurisdiction</dt><dd>{{ e.jurisdiction }}</dd>
        }
        @if (e.parent) {
          <dt>Parent</dt>
          <dd><button class="link" (click)="navigate.emit(e.parent!.id)">{{ e.parent.name }}</button></dd>
        }
        <dt>Subsidiaries</dt><dd class="mono">{{ e.subsidiaries | number }}</dd>
        <dt>Positions held</dt>
        <dd class="mono">{{ e.positionsHeld | number }} <span class="muted">{{ e.valueHeld | currency: 'USD' : 'symbol' : '1.0-0' }}</span></dd>
        <dt>Positions issued</dt>
        <dd class="mono">{{ e.positionsIssued | number }} <span class="muted">{{ e.valueIssued | currency: 'USD' : 'symbol' : '1.0-0' }}</span></dd>
      </dl>
    } @else {
      <p class="muted">Search for an entity to start exploring.</p>
    }
  `,
  styles: `
    h1 { margin: 0; font-size: 18px; font-weight: 600; }
    .head { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
    .kinds { display: flex; gap: 6px; }
    dl { display: grid; grid-template-columns: 120px 1fr; gap: 4px 10px; margin: 0; }
    dt { color: var(--muted); }
    dd { margin: 0; }
  `,
})
export class EntityCard {
  readonly entity = input<EntityDetail | null>(null);
  readonly navigate = output<string>();
}
