package dev.tradegraph.api.service;

import com.github.benmanes.caffeine.cache.stats.CacheStats;
import dev.tradegraph.api.config.TradeGraphProperties;
import dev.tradegraph.api.model.OpsOverview;
import dev.tradegraph.api.model.QualityReport;
import dev.tradegraph.api.model.Stats;
import dev.tradegraph.api.sparql.QueryMetrics;
import java.util.List;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.caffeine.CaffeineCache;
import org.springframework.stereotype.Service;

/** Assembles {@code /ops/overview} from the store counts, the caches, the query ring buffer and the quality report. */
@Service
public class OpsService {

    private final StatsService stats;
    private final QualityService quality;
    private final QueryMetrics metrics;
    private final CacheManager caches;
    private final TradeGraphProperties properties;

    public OpsService(StatsService stats, QualityService quality, QueryMetrics metrics, CacheManager caches,
            TradeGraphProperties properties) {
        this.stats = stats;
        this.quality = quality;
        this.metrics = metrics;
        this.caches = caches;
        this.properties = properties;
    }

    public OpsOverview overview() {
        long started = System.nanoTime();
        Stats counts = stats.stats();
        List<OpsOverview.SlowQuery> slowest = metrics.slowest(properties.ops().slowestQueries()).stream()
                .map(t -> new OpsOverview.SlowQuery(t.template(), t.millis(), t.at()))
                .toList();
        return new OpsOverview(
                properties.store().kind(),
                properties.store().queryUrl(),
                properties.store().reasoning(),
                counts.triples(),
                counts.entities(),
                counts.positions(),
                properties.exposure().maxDepth(),
                properties.lineage().maxDepth(),
                cacheStats(),
                slowest,
                qualitySummary(),
                (System.nanoTime() - started) / 1_000_000);
    }

    private OpsOverview.CacheStats cacheStats() {
        long hits = 0;
        long misses = 0;
        long entries = 0;
        int counted = 0;
        for (String name : caches.getCacheNames()) {
            Cache cache = caches.getCache(name);
            if (!(cache instanceof CaffeineCache caffeine)) {
                continue;
            }
            CacheStats snapshot = caffeine.getNativeCache().stats();
            hits += snapshot.hitCount();
            misses += snapshot.missCount();
            entries += caffeine.getNativeCache().estimatedSize();
            counted++;
        }
        long total = hits + misses;
        double ratio = total == 0 ? 0 : (double) hits / total;
        return new OpsOverview.CacheStats(hits, misses, Math.round(ratio * 10_000) / 10_000.0, entries, counted);
    }

    private OpsOverview.QualitySummary qualitySummary() {
        try {
            QualityReport report = quality.report();
            return new OpsOverview.QualitySummary(report.checkedAt(), report.conforms(),
                    report.danglingReferences(), report.subsidiaryCycles(), report.missingIdentifiers(),
                    report.shaclViolations());
        } catch (NotFoundException e) {
            return null;
        }
    }
}
