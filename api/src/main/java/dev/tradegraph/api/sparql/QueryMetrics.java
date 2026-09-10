package dev.tradegraph.api.sparql;

import io.micrometer.core.instrument.MeterRegistry;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Latency of every SPARQL query, by template. Micrometer keeps the aggregate, and a ring
 * buffer keeps the last few hundred individual timings so {@code /ops/overview} can show
 * what has actually been slow without turning on query logging.
 */
public class QueryMetrics {

    /** One recorded query: which template it came from, how long it took and when. */
    public record Timing(String template, long millis, Instant at) {
    }

    private final MeterRegistry registry;
    private final Timing[] ring;
    private int cursor;

    public QueryMetrics(MeterRegistry registry, int bufferSize) {
        this.registry = registry;
        this.ring = new Timing[Math.max(bufferSize, 1)];
    }

    public void record(String template, long millis) {
        registry.timer("tradegraph.sparql", "template", template).record(millis, TimeUnit.MILLISECONDS);
        synchronized (this) {
            ring[cursor] = new Timing(template, millis, Instant.now());
            cursor = (cursor + 1) % ring.length;
        }
    }

    /** The slowest timings still in the buffer, slowest first. */
    public List<Timing> slowest(int limit) {
        List<Timing> seen = new ArrayList<>(ring.length);
        synchronized (this) {
            for (Timing t : ring) {
                if (t != null) {
                    seen.add(t);
                }
            }
        }
        seen.sort(Comparator.comparingLong(Timing::millis).reversed());
        return seen.subList(0, Math.min(limit, seen.size()));
    }
}
