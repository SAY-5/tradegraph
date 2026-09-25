package dev.tradegraph.api.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import dev.tradegraph.api.model.NeighborGraph;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;

/**
 * What the neighbour row limit drops. The fixture issuer has one parent, two subsidiaries
 * and five holders, so a request for three rows cannot return all eight edges: the lineage
 * edges the explorer draws the corporate tree from have to survive and the holdings, of
 * which a real issuer has hundreds, have to be the rows that go.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class NeighborLimitIT {

    private static final GenericContainer<?> FUSEKI = FusekiSupport.start();
    private static final String HUB = "0000000010";
    private static final String PARENT = "0000000009";

    @Autowired
    private TestRestTemplate rest;

    @DynamicPropertySource
    static void storeProperties(DynamicPropertyRegistry registry) {
        registry.add("tradegraph.store.query-url", () -> FusekiSupport.queryUrl(FUSEKI));
    }

    @BeforeAll
    static void loadFixture() {
        FusekiSupport.loadFixture(FUSEKI, "/neighbors.ttl");
    }

    @Test
    void aRowLimitBelowTheEdgeCountKeepsLineageAndDropsHoldings() {
        NeighborGraph tight = neighbors(3);

        assertThat(tight.links()).extracting(NeighborGraph.Link::source, NeighborGraph.Link::target,
                        NeighborGraph.Link::rel)
                .containsExactlyInAnyOrder(
                        tuple(HUB, PARENT, "subsidiaryOf"),
                        tuple("S00001001", HUB, "subsidiaryOf"),
                        tuple("S00001002", HUB, "subsidiaryOf"));
        assertThat(tight.nodes()).extracting(NeighborGraph.Node::id)
                .containsExactlyInAnyOrder(HUB, PARENT, "S00001001", "S00001002");
    }

    @Test
    void aRowLimitAboveTheEdgeCountReturnsLineageAndEveryHolder() {
        NeighborGraph full = neighbors(20);

        assertThat(full.links()).hasSize(8);
        assertThat(full.links()).filteredOn(l -> l.rel().equals("subsidiaryOf")).hasSize(3);
        assertThat(full.links()).filteredOn(l -> l.rel().equals("holds"))
                .extracting(NeighborGraph.Link::source)
                .containsExactlyInAnyOrder("0000000101", "0000000102", "0000000103", "0000000104",
                        "0000000105");
    }

    @Test
    void holdingRowsThatSurviveTheLimitAreTheLargestOnes() {
        NeighborGraph partial = neighbors(5);

        assertThat(partial.links()).filteredOn(l -> l.rel().equals("holds"))
                .extracting(NeighborGraph.Link::source)
                .containsExactly("0000000101", "0000000102");
    }

    private NeighborGraph neighbors(int limit) {
        return rest.getForObject("/graph/neighbors/" + HUB + "?limit=" + limit, NeighborGraph.class);
    }
}
