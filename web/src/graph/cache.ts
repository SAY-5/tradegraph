/*
 * A small bounded cache in front of the query functions, standing in for the Caffeine
 * caches the API puts on every service method (maximumSize=5000). Entries are evicted in
 * insertion order rather than by age: the demo has no clock to expire against, and a
 * repeated query has to give back the identical object for the cache badge to mean
 * anything.
 */

export interface Cached<T> {
  value: T;
  /** true when the answer came from the cache rather than from the store. */
  cacheHit: boolean;
  /** Milliseconds spent on this call, whether that was a lookup or the real work. */
  millis: number;
}

export class QueryCache {
  hits = 0;
  misses = 0;

  private readonly entries = new Map<string, unknown>();

  constructor(readonly maximumSize = 5000) {}

  get size(): number {
    return this.entries.size;
  }

  run<T>(key: string, load: () => T): Cached<T> {
    const started = performance.now();
    if (this.entries.has(key)) {
      this.hits += 1;
      return { value: this.entries.get(key) as T, cacheHit: true, millis: performance.now() - started };
    }
    this.misses += 1;
    const value = load();
    if (this.entries.size >= this.maximumSize) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, value);
    return { value, cacheHit: false, millis: performance.now() - started };
  }

  clear(): void {
    this.entries.clear();
    this.hits = 0;
    this.misses = 0;
  }
}
