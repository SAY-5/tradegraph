import { Component, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { Subject, debounceTime, distinctUntilChanged, filter, switchMap, catchError, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from '../api.service';
import { EntitySummary } from '../models';

@Component({
  selector: 'tg-search-bar',
  template: `
    <div class="search">
      <input
        #box
        type="search"
        [placeholder]="placeholder"
        autocomplete="off"
        (input)="onInput(box.value)"
        (keydown.escape)="close()"
        (keydown.enter)="pickFirst()"
      />
      @if (open() && results().length) {
        <ul class="results" role="listbox">
          @for (r of results(); track r.id) {
            <li role="option" aria-selected="false" (mousedown)="pick(r)">
              <span class="name">{{ r.name }}</span>
              <span class="meta mono">{{ r.ticker || r.cik || r.id }}</span>
              @for (k of r.kinds; track k) {
                <span class="kind" [class]="'kind ' + k">{{ k }}</span>
              }
            </li>
          }
        </ul>
      } @else if (open() && searched() && !results().length) {
        <div class="results empty muted">No entities match</div>
      }
    </div>
  `,
  styles: `
    .search { position: relative; }
    .results {
      position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 4px);
      margin: 0; padding: 4px; list-style: none;
      background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px;
      max-height: 360px; overflow: auto; box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
    }
    .results.empty { padding: 10px 12px; }
    li { display: flex; gap: 8px; align-items: center; padding: 7px 10px; border-radius: 6px; cursor: pointer; }
    li:hover { background: var(--panel); }
    .name { flex: 1; }
    .meta { color: var(--muted); font-size: 12px; }
  `,
})
export class SearchBar {
  private readonly api = inject(ApiService);
  private readonly queries = new Subject<string>();
  readonly box = viewChild.required<ElementRef<HTMLInputElement>>('box');

  placeholder = 'Search issuers, funds, subsidiaries by name, ticker or CIK';
  readonly picked = output<EntitySummary>();
  readonly results = signal<EntitySummary[]>([]);
  readonly open = signal(false);
  readonly searched = signal(false);

  constructor() {
    this.queries
      .pipe(
        debounceTime(180),
        distinctUntilChanged(),
        filter((q) => q.trim().length >= 2),
        switchMap((q) => this.api.search(q.trim()).pipe(catchError(() => of([])))),
        takeUntilDestroyed(),
      )
      .subscribe((rows) => {
        this.results.set(rows);
        this.searched.set(true);
        this.open.set(true);
      });
  }

  onInput(value: string): void {
    if (value.trim().length < 2) {
      this.results.set([]);
      this.open.set(false);
      this.searched.set(false);
      return;
    }
    this.queries.next(value);
  }

  pick(r: EntitySummary): void {
    this.picked.emit(r);
    this.close();
    this.box().nativeElement.value = '';
  }

  pickFirst(): void {
    const first = this.results()[0];
    if (first) {
      this.pick(first);
    }
  }

  close(): void {
    this.open.set(false);
  }
}
