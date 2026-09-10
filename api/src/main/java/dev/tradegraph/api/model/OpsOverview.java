package dev.tradegraph.api.model;

import java.time.Instant;
import java.util.List;

/** What an operator needs at a glance: the store, the cache, recent query cost and data quality. */
public record OpsOverview(
        String store,
        String queryUrl,
        boolean reasoning,
        long triples,
        long entities,
        long positions,
        int exposureMaxDepth,
        int lineageMaxDepth,
        CacheStats cache,
        List<SlowQuery> slowestQueries,
        QualitySummary quality,
        long queryMillis) {

    /** Caffeine counters summed over every cache the API keeps. */
    public record CacheStats(long hits, long misses, double hitRatio, long entries, int caches) {
    }

    /** One entry of the query timing ring buffer. */
    public record SlowQuery(String template, long millis, Instant at) {
    }

    /** The headline of the last {@code tradegraph-etl validate} run, or null when there is none. */
    public record QualitySummary(
            Instant checkedAt,
            boolean conforms,
            long danglingReferences,
            long subsidiaryCycles,
            long missingIdentifiers,
            long shaclViolations) {
    }
}
