package dev.tradegraph.api.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import dev.tradegraph.api.model.EntitySummary;
import dev.tradegraph.api.model.ExposureResponse;
import dev.tradegraph.api.model.Stats;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;

/**
 * Query budget over the full sample (6,100 entities, 12,941 positions). Requires
 * {@code make etl-sample} to have produced {@code etl/build/*.nt}; skipped otherwise.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.cache.type=none")
class ExposurePerformanceIT {

    /** Uncached exposure answer, including lineage explanation, must return within this budget. */
    static final long BUDGET_MILLIS = 1500;
    static final int PAIRS = 12;

    private static final Path SAMPLE = FusekiSupport.sampleBuildDir();
    private static final GenericContainer<?> FUSEKI = SAMPLE == null ? null : FusekiSupport.start();

    @Autowired
    private TestRestTemplate rest;

    @DynamicPropertySource
    static void storeProperties(DynamicPropertyRegistry registry) {
        if (FUSEKI != null) {
            registry.add("tradegraph.store.query-url", () -> FusekiSupport.queryUrl(FUSEKI));
        } else {
            registry.add("tradegraph.store.query-url", () -> "http://localhost:1/none");
        }
    }

    @BeforeAll
    static void loadSample() {
        if (FUSEKI != null) {
            FusekiSupport.putGraph(FUSEKI, FusekiSupport.GRAPH_ENTITIES, SAMPLE.resolve("entities.nt"),
                    "application/n-triples");
            FusekiSupport.putGraph(FUSEKI, FusekiSupport.GRAPH_POSITIONS, SAMPLE.resolve("positions.nt"),
                    "application/n-triples");
        }
    }

    @Test
    void exposureOverFullSampleAnswersWithinBudget() {
        assumeTrue(SAMPLE != null, "etl/build not present; run make etl-sample");
        Stats stats = rest.getForObject("/stats", Stats.class);
        assertThat(stats.entities()).isGreaterThanOrEqualTo(5000);

        List<EntitySummary> funds = list("/entities?q={q}&limit={limit}", "Strategic Equity Fund", PAIRS);
        List<EntitySummary> issuers = new ArrayList<>();
        for (String ticker : List.of("AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "JPM")) {
            issuers.addAll(list("/entities?q={q}&limit=1", ticker));
        }
        assertThat(funds).hasSizeGreaterThanOrEqualTo(PAIRS / 2);
        assertThat(issuers).hasSizeGreaterThanOrEqualTo(3);

        List<Long> latencies = new ArrayList<>();
        long nonZero = 0;
        for (int i = 0; i < Math.min(PAIRS, funds.size()); i++) {
            EntitySummary fund = funds.get(i);
            EntitySummary issuer = issuers.get(i % issuers.size());
            long started = System.nanoTime();
            ExposureResponse r = rest.getForObject("/entities/" + fund.id() + "/exposure?issuer=" + issuer.id(),
                    ExposureResponse.class);
            long millis = (System.nanoTime() - started) / 1_000_000;
            latencies.add(millis);
            if (r.totalValue().signum() > 0) {
                nonZero++;
            }
            System.out.printf("exposure %s -> %s: total=%s lines=%d longestPath=%d %d ms%n",
                    fund.name(), issuer.ticker(), r.totalValue().toPlainString(), r.byInstrument().size(),
                    r.longestPath(), millis);
        }
        long max = latencies.stream().mapToLong(Long::longValue).max().orElse(0);
        double avg = latencies.stream().mapToLong(Long::longValue).average().orElse(0);
        System.out.printf("exposure latency over %d pairs: max=%d ms avg=%.0f ms budget=%d ms%n",
                latencies.size(), max, avg, BUDGET_MILLIS);
        assertThat(nonZero).as("pairs with non-zero exposure").isGreaterThan(0);
        assertThat(max).isLessThan(BUDGET_MILLIS);
    }

    private List<EntitySummary> list(String url, Object... vars) {
        return rest.exchange(url, HttpMethod.GET, null,
                new ParameterizedTypeReference<List<EntitySummary>>() { }, vars).getBody();
    }
}
