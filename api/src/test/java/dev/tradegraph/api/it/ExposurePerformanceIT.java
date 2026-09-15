package dev.tradegraph.api.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import dev.tradegraph.api.model.EntitySummary;
import dev.tradegraph.api.model.ExposureResponse;
import dev.tradegraph.api.model.Stats;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
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
 * Query budget over the full sample (6,100 entities, 24,336 positions over two periods). Requires
 * {@code make etl-sample} to have produced {@code etl/build/*.nt}. A local run without that data
 * is skipped; a run with {@code TRADEGRAPH_REQUIRE_SAMPLE=1} fails instead, which is what CI
 * sets, so a missing or renamed artifact cannot turn this into a silent pass.
 *
 * <p>The measured latencies are written to {@code target/benchmarks/exposure-latency.txt} so a
 * run leaves evidence a document can quote instead of a number somebody remembered.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.cache.type=none")
class ExposurePerformanceIT {

    /** Uncached exposure answer, including lineage explanation, must return within this budget. */
    static final long BUDGET_MILLIS = 1500;
    static final int PAIRS = 12;
    /** Set by CI, where the sample arrives as an artifact and its absence is a failure. */
    private static final boolean SAMPLE_REQUIRED = "1".equals(System.getenv("TRADEGRAPH_REQUIRE_SAMPLE"));
    private static final Path BENCHMARK = Path.of("target", "benchmarks", "exposure-latency.txt");

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
    void exposureOverFullSampleAnswersWithinBudget() throws IOException {
        if (SAMPLE == null && SAMPLE_REQUIRED) {
            throw new AssertionError(
                    "TRADEGRAPH_REQUIRE_SAMPLE=1 but no sample was found; run make etl-sample");
        }
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
        String measured = String.format(
                "exposure latency over %d pairs: max=%d ms avg=%.0f ms budget=%d ms",
                latencies.size(), max, avg, BUDGET_MILLIS);
        System.out.println(measured);
        record(stats, measured);
        assertThat(nonZero).as("pairs with non-zero exposure").isGreaterThan(0);
        assertThat(max).isLessThan(BUDGET_MILLIS);
    }

    /** Leaves the run's own numbers on disk, with what they were measured against. */
    private static void record(Stats stats, String measured) throws IOException {
        Files.createDirectories(BENCHMARK.getParent());
        Files.writeString(BENCHMARK, String.join(System.lineSeparator(),
                "# ExposurePerformanceIT, uncached exposure over the full sample",
                "measuredAt   : " + Instant.now().toString().substring(0, 19) + "Z",
                "store        : " + stats.store() + ", Fuseki in Testcontainers",
                "dataset      : " + stats.entities() + " entities, " + stats.positions()
                        + " positions, " + stats.triples() + " triples",
                "jvm          : " + System.getProperty("java.version") + " on "
                        + System.getProperty("os.name") + " " + System.getProperty("os.arch")
                        + ", " + Runtime.getRuntime().availableProcessors() + " cores",
                measured,
                ""));
    }

    private List<EntitySummary> list(String url, Object... vars) {
        return rest.exchange(url, HttpMethod.GET, null,
                new ParameterizedTypeReference<List<EntitySummary>>() { }, vars).getBody();
    }
}
