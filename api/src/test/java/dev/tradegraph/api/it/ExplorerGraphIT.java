package dev.tradegraph.api.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import dev.tradegraph.api.model.ConcentrationResponse;
import dev.tradegraph.api.model.LineageResponse;
import dev.tradegraph.api.model.NeighborGraph;
import java.math.BigDecimal;
import java.nio.file.Path;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;

/**
 * The endpoints the explorer calls, against the full sample rather than the six entity
 * fixture. Ordering, row limits and truncation only behave differently at scale: a fixture
 * issuer has one holder, while Apple Inc. has 27 in this sample, which is what made the
 * neighbour query drop its lineage rows unnoticed.
 *
 * <p>Requires {@code make etl-sample}. A local run without that data is skipped; a run with
 * {@code TRADEGRAPH_REQUIRE_SAMPLE=1} fails, which is what CI sets.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.cache.type=none")
class ExplorerGraphIT {

    /** Apple Inc.: no parent, five direct subsidiaries, 27 distinct holders in the sample. */
    private static final String APPLE = "0000320193";
    /** A fund family that holds several hundred distinct issuers in one reporting period. */
    private static final String T_ROWE = "0001113169";

    private static final Path SAMPLE = FusekiSupport.sampleBuildDir();
    private static final GenericContainer<?> FUSEKI = SAMPLE == null ? null : FusekiSupport.start();
    private static final boolean SAMPLE_REQUIRED = "1".equals(System.getenv("TRADEGRAPH_REQUIRE_SAMPLE"));

    @Autowired
    private TestRestTemplate rest;

    @DynamicPropertySource
    static void storeProperties(DynamicPropertyRegistry registry) {
        registry.add("tradegraph.store.query-url",
                () -> FUSEKI == null ? "http://localhost:1/none" : FusekiSupport.queryUrl(FUSEKI));
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

    private void requireSample() {
        if (SAMPLE == null && SAMPLE_REQUIRED) {
            throw new AssertionError(
                    "TRADEGRAPH_REQUIRE_SAMPLE=1 but no sample was found; run make etl-sample");
        }
        assumeTrue(SAMPLE != null, "etl/build not present; run make etl-sample");
    }

    @Test
    void theExplorersNeighbourRequestKeepsLineageAtSampleScale() {
        requireSample();

        // 15 is what the explorer asks for when a node is expanded, and Apple has far more
        // holders than that, so the lineage rows only survive if the query ranks them first.
        NeighborGraph expanded = rest.getForObject("/graph/neighbors/" + APPLE + "?limit=15",
                NeighborGraph.class);
        assertThat(expanded.links()).filteredOn(l -> l.rel().equals("subsidiaryOf")).hasSize(5);
        assertThat(expanded.links()).filteredOn(l -> l.rel().equals("holds")).hasSize(10);

        // 30 is the initial load. The lineage rows are the same five.
        NeighborGraph initial = rest.getForObject("/graph/neighbors/" + APPLE + "?limit=30",
                NeighborGraph.class);
        assertThat(initial.links()).filteredOn(l -> l.rel().equals("subsidiaryOf")).hasSize(5);
        assertThat(initial.links()).hasSize(30);
        assertThat(initial.links()).filteredOn(l -> l.rel().equals("subsidiaryOf"))
                .allSatisfy(l -> assertThat(l.target()).isEqualTo(APPLE));
    }

    @Test
    void lineageAtSampleScaleMatchesTheDocumentedTree() {
        requireSample();

        LineageResponse lineage = rest.getForObject("/entities/" + APPLE + "/lineage",
                LineageResponse.class);
        assertThat(lineage.descendantCount()).isEqualTo(6);
        assertThat(lineage.deepestLevel()).isEqualTo(2);
        assertThat(lineage.ancestors()).isEmpty();
        assertThat(lineage.ultimateParent().id()).isEqualTo(APPLE);
    }

    @Test
    void concentrationIsBoundedAndStillCountsEveryIssuerAboveTheThreshold() {
        requireSample();

        ConcentrationResponse capped = rest.getForObject(
                "/exposure/concentration?entity=" + T_ROWE + "&limit=5&min_share=0",
                ConcentrationResponse.class);
        assertThat(capped.issuers()).hasSize(5);
        assertThat(capped.totalValue()).isGreaterThan(BigDecimal.ZERO);
        // The page is capped at five rows while the count covers the whole family, which a
        // query without a store side bound would have had to return row by row.
        assertThat(capped.issuersAboveShare()).isGreaterThan(200);
        assertThat(capped.issuers()).isSortedAccordingTo(
                (a, b) -> b.value().compareTo(a.value()));

        ConcentrationResponse threshold = rest.getForObject(
                "/exposure/concentration?entity=" + T_ROWE + "&limit=50&min_share=0.02",
                ConcentrationResponse.class);
        assertThat(threshold.issuers()).allSatisfy(
                line -> assertThat(line.share()).isGreaterThanOrEqualTo(new BigDecimal("0.02")));
        assertThat(threshold.issuersAboveShare()).isLessThan(capped.issuersAboveShare());
    }
}
