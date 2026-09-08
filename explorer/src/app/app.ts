import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { forkJoin } from 'rxjs';
import { ApiService } from './api.service';
import {
  EntityDetail,
  EntityRef,
  EntitySummary,
  LineageResponse,
  NeighborGraph,
  Stats,
  TradeRecord,
  mergeGraphs,
} from './models';
import { EntityCard } from './components/entity-card';
import { ExposurePanel } from './components/exposure-panel';
import { GraphView } from './components/graph-view';
import { LineagePanel } from './components/lineage-panel';
import { SearchBar } from './components/search-bar';
import { TradesTable } from './components/trades-table';

@Component({
  selector: 'app-root',
  imports: [DecimalPipe, SearchBar, EntityCard, LineagePanel, ExposurePanel, GraphView, TradesTable],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly api = inject(ApiService);

  readonly stats = signal<Stats | null>(null);
  readonly entity = signal<EntityDetail | null>(null);
  readonly lineage = signal<LineageResponse | null>(null);
  readonly graph = signal<NeighborGraph | null>(null);
  readonly trades = signal<TradeRecord[]>([]);
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);

  /** The fund used by the exposure panel: the selected entity when it is a fund, else its nearest fund ancestor. */
  readonly fund = computed<EntityRef | null>(() => {
    const e = this.entity();
    if (!e) {
      return null;
    }
    if (e.kinds.includes('Fund')) {
      return { id: e.id, name: e.name, kinds: e.kinds };
    }
    const ancestor = this.lineage()?.ancestors.find((a) => a.kinds.includes('Fund'));
    return ancestor ?? null;
  });

  constructor() {
    this.api.stats().subscribe({ next: (s) => this.stats.set(s), error: () => this.error.set('API unreachable') });
  }

  onPicked(e: EntitySummary): void {
    this.open(e.id);
  }

  open(id: string): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      entity: this.api.entity(id),
      lineage: this.api.lineage(id),
      graph: this.api.neighbors(id),
      trades: this.api.trades(id),
    }).subscribe({
      next: ({ entity, lineage, graph, trades }) => {
        this.entity.set(entity);
        this.lineage.set(lineage);
        this.graph.set(graph);
        this.trades.set(trades);
        this.loading.set(false);
      },
      error: (e: { error?: { detail?: string } }) => {
        this.error.set(e.error?.detail ?? `could not load ${id}`);
        this.loading.set(false);
      },
    });
  }

  expand(id: string): void {
    const current = this.graph();
    if (!current || id === current.center) {
      return;
    }
    this.api.neighbors(id, 15).subscribe((extra) => this.graph.set(mergeGraphs(current, extra)));
  }
}
