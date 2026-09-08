import { Component, input, output } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { TradeRecord } from '../models';

@Component({
  selector: 'tg-trades-table',
  imports: [CurrencyPipe, DecimalPipe],
  template: `
    <h2>Positions</h2>
    @if (trades().length) {
      <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>Holder</th>
            <th>Issuer</th>
            <th>Instrument</th>
            <th class="num">Quantity</th>
            <th class="num">Value</th>
            <th>Filing</th>
          </tr>
        </thead>
        <tbody>
          @for (t of trades(); track t.id) {
            <tr>
              <td><button class="link" (click)="navigate.emit(t.holder.id)">{{ t.holder.name }}</button></td>
              <td><button class="link" (click)="navigate.emit(t.issuer.id)">{{ t.issuer.name }}</button></td>
              <td><span class="mono">{{ t.instrument.ticker || t.instrument.cusip }}</span> <span class="muted">{{ t.instrument.instrumentClass }}</span></td>
              <td class="num">{{ t.quantity | number: '1.0-0' }}</td>
              <td class="num">{{ t.value | currency: 'USD' : 'symbol' : '1.0-0' }}</td>
              <td class="mono muted">{{ t.formType }} {{ t.accessionNumber }}</td>
            </tr>
          }
        </tbody>
      </table>
      </div>
    } @else {
      <p class="muted">No positions on either side.</p>
    }
  `,
  styles: `
    .scroll { overflow-x: auto; }
    td, th { white-space: nowrap; }
  `,
})
export class TradesTable {
  readonly trades = input<TradeRecord[]>([]);
  readonly navigate = output<string>();
}
