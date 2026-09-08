import { Component, input, output } from '@angular/core';
import { LineageNode, LineageResponse } from '../models';

@Component({
  selector: 'tg-lineage-tree',
  template: `
    <ul class="tree">
      @for (c of node().children; track c.id) {
        <li>
          <button class="link" (click)="navigate.emit(c.id)">{{ c.name }}</button>
          @if (c.jurisdiction) {
            <span class="muted mono"> {{ c.jurisdiction }}</span>
          }
          @if (c.children.length) {
            <tg-lineage-tree [node]="c" (navigate)="navigate.emit($event)" />
          }
        </li>
      }
    </ul>
  `,
  styles: `
    .tree { list-style: none; margin: 0; padding-left: 14px; border-left: 1px solid var(--border); }
    li { padding: 2px 0; }
  `,
})
export class LineageTree {
  readonly node = input.required<LineageNode>();
  readonly navigate = output<string>();
}

@Component({
  selector: 'tg-lineage-panel',
  imports: [LineageTree],
  template: `
    <h2>Lineage</h2>
    @if (lineage(); as l) {
      <div class="chain">
        @for (a of ancestorsTopDown(l); track a.id) {
          <button class="link" (click)="navigate.emit(a.id)">{{ a.name }}</button>
          <span class="muted">&rsaquo;</span>
        }
        <strong>{{ l.entity.name }}</strong>
      </div>
      <p class="muted summary">
        {{ l.descendantCount }} subsidiaries within {{ l.maxDepth }} levels, deepest level {{ l.deepestLevel }},
        <span class="mono">{{ l.queryMillis }} ms</span>
      </p>
      @if (l.descendants.children.length) {
        <tg-lineage-tree [node]="l.descendants" (navigate)="navigate.emit($event)" />
      } @else {
        <p class="muted">No subsidiaries recorded.</p>
      }
    } @else {
      <p class="muted">Select an entity to see its corporate tree.</p>
    }
  `,
  styles: `
    .chain { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
    .summary { margin: 6px 0 10px; font-size: 12px; }
  `,
})
export class LineagePanel {
  readonly lineage = input<LineageResponse | null>(null);
  readonly navigate = output<string>();

  ancestorsTopDown(l: LineageResponse) {
    return [...l.ancestors].reverse();
  }
}
