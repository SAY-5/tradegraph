package dev.tradegraph.api.sparql;

import static org.assertj.core.api.Assertions.assertThat;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class QueryMetricsTest {

    @Test
    void timingsAreTaggedByTemplate() {
        SimpleMeterRegistry registry = new SimpleMeterRegistry();
        QueryMetrics metrics = new QueryMetrics(registry, 10);

        metrics.record("exposure", 120);
        metrics.record("exposure", 80);
        metrics.record("stats", 5);

        assertThat(registry.timer("tradegraph.sparql", "template", "exposure").count()).isEqualTo(2);
        assertThat(registry.timer("tradegraph.sparql", "template", "exposure").totalTime(TimeUnit.MILLISECONDS))
                .isEqualTo(200);
        assertThat(registry.timer("tradegraph.sparql", "template", "stats").count()).isEqualTo(1);
    }

    @Test
    void theSlowestTimingsComeBackFirst() {
        QueryMetrics metrics = new QueryMetrics(new SimpleMeterRegistry(), 10);
        metrics.record("stats", 5);
        metrics.record("exposure", 120);
        metrics.record("trades", 40);

        assertThat(metrics.slowest(2)).extracting(QueryMetrics.Timing::template)
                .containsExactly("exposure", "trades");
        assertThat(metrics.slowest(10)).hasSize(3);
    }

    @Test
    void theBufferKeepsOnlyTheMostRecentTimings() {
        QueryMetrics metrics = new QueryMetrics(new SimpleMeterRegistry(), 2);
        metrics.record("exposure", 900);
        metrics.record("stats", 5);
        metrics.record("trades", 40);

        assertThat(metrics.slowest(10)).extracting(QueryMetrics.Timing::template)
                .containsExactly("trades", "stats")
                .doesNotContain("exposure");
    }
}
