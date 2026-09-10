package dev.tradegraph.api.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import dev.tradegraph.api.model.ConcentrationResponse;
import dev.tradegraph.api.model.EntityDetail;
import dev.tradegraph.api.model.EntitySummary;
import dev.tradegraph.api.model.ExposureResponse;
import dev.tradegraph.api.model.LineageResponse;
import dev.tradegraph.api.model.NeighborGraph;
import dev.tradegraph.api.model.Stats;
import dev.tradegraph.api.model.TradeRecord;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ApiIT {

    private static final GenericContainer<?> FUSEKI = FusekiSupport.start();

    @Autowired
    private TestRestTemplate rest;

    @DynamicPropertySource
    static void storeProperties(DynamicPropertyRegistry registry) {
        registry.add("tradegraph.store.query-url", () -> FusekiSupport.queryUrl(FUSEKI));
    }

    @BeforeAll
    static void loadFixture() {
        FusekiSupport.loadFixture(FUSEKI);
    }

    @Test
    void healthReportsStoreComponent() {
        JsonNode health = rest.getForObject("/actuator/health", JsonNode.class);
        assertThat(health.path("status").asText()).isEqualTo("UP");
        assertThat(health.path("components").path("store").path("status").asText()).isEqualTo("UP");
        assertThat(health.path("components").path("store").path("details").path("kind").asText())
                .isEqualTo("fuseki");
    }

    @Test
    void statsCountEveryClass() {
        Stats stats = rest.getForObject("/stats", Stats.class);
        assertThat(stats.entities()).isEqualTo(6);
        assertThat(stats.issuers()).isEqualTo(3);
        assertThat(stats.funds()).isEqualTo(2);
        assertThat(stats.subsidiaries()).isEqualTo(2);
        assertThat(stats.positions()).isEqualTo(4);
        assertThat(stats.filings()).isEqualTo(3);
        assertThat(stats.lineageEdges()).isEqualTo(3);
        assertThat(stats.triples()).isGreaterThan(80);
    }

    @Test
    void searchMatchesNameTickerAndCik() {
        List<EntitySummary> byName = list("/entities?q={q}", "acme");
        assertThat(byName).extracting(EntitySummary::name)
                .containsExactly("Acme Corp", "Acme Finance Corp.", "Acme Regional Unit 1 Ltd.");
        assertThat(byName.get(0).kinds()).containsExactly("Issuer");

        assertThat(list("/entities?q={q}", "bigf")).extracting(EntitySummary::id)
                .containsExactly("0000000002", "F00000201");
        assertThat(list("/entities?q={q}", "0000000003")).extracting(EntitySummary::ticker).containsExactly("OTHR");
        assertThat(list("/entities?q={q}", "zzz")).isEmpty();
    }

    @Test
    void searchRejectsShortQueryAndEscapesQuotes() {
        assertThat(rest.getForEntity("/entities?q=a", String.class).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(list("/entities?q={q}", "\") } ?s ?p ?o . FILTER(\"")).isEmpty();
        assertThat(list("/entities?q={q}", "Acme Fin")).extracting(EntitySummary::id).containsExactly("S00000101");
    }

    @Test
    void entityDetailIncludesParentAndCounts() {
        EntityDetail fin = rest.getForObject("/entities/S00000101", EntityDetail.class);
        assertThat(fin.name()).isEqualTo("Acme Finance Corp.");
        assertThat(fin.kinds()).containsExactly("Subsidiary");
        assertThat(fin.parent().id()).isEqualTo("0000000001");
        assertThat(fin.subsidiaries()).isEqualTo(1);
        assertThat(fin.positionsIssued()).isEqualTo(1);
        assertThat(fin.valueIssued()).isEqualByComparingTo(new BigDecimal("49000.5"));

        EntityDetail bigfund = rest.getForObject("/entities/0000000002", EntityDetail.class);
        assertThat(bigfund.kinds()).containsExactly("Fund", "Issuer");
        assertThat(bigfund.positionsHeld()).isEqualTo(3);
        assertThat(bigfund.valueHeld()).isEqualByComparingTo(new BigDecimal("2027.0"));
    }

    @Test
    void unknownAndMalformedIdsAreRejected() {
        assertThat(rest.getForEntity("/entities/9999999999", String.class).getStatusCode())
                .isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(rest.getForEntity("/entities/bad%20id%3E", String.class).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void lineageWalksUpAndDown() {
        LineageResponse leaf = rest.getForObject("/entities/S0000010101/lineage", LineageResponse.class);
        assertThat(leaf.ancestors()).extracting("id").containsExactly("S00000101", "0000000001");
        assertThat(leaf.ultimateParent().id()).isEqualTo("0000000001");
        assertThat(leaf.descendantCount()).isZero();

        LineageResponse acme = rest.getForObject("/entities/0000000001/lineage", LineageResponse.class);
        assertThat(acme.ancestors()).isEmpty();
        assertThat(acme.descendantCount()).isEqualTo(2);
        assertThat(acme.deepestLevel()).isEqualTo(2);
        assertThat(acme.descendants().children().get(0).children().get(0).name())
                .isEqualTo("Acme Regional Unit 1 Ltd.");

        LineageResponse shallow = rest.getForObject("/entities/0000000001/lineage?depth=1", LineageResponse.class);
        assertThat(shallow.descendantCount()).isEqualTo(1);
        assertThat(shallow.maxDepth()).isEqualTo(1);
    }

    @Test
    void exposureAggregatesThroughAffiliatesAndSubsidiaries() {
        ExposureResponse full = rest.getForObject(
                "/entities/F00000201/exposure?issuer=0000000001", ExposureResponse.class);
        assertThat(full.totalValue()).isEqualByComparingTo(new BigDecimal("50250.5"));
        assertThat(full.directValue()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(full.viaSubsidiariesValue()).isEqualByComparingTo(new BigDecimal("49000.5"));
        assertThat(full.viaAffiliatesValue()).isEqualByComparingTo(new BigDecimal("1250.0"));
        assertThat(full.positions()).isEqualTo(3);
        assertThat(full.longestPath()).isEqualTo(4);
        assertThat(full.byInstrument()).hasSize(3);
        assertThat(full.byInstrument().get(0).instrument().instrumentClass()).isEqualTo("DEBT");
        assertThat(full.byInstrument().get(0).lineagePath()).extracting("id")
                .containsExactly("F00000201", "S00000101", "0000000001");
        assertThat(full.byInstrument().get(0).explanation())
                .isEqualTo("Bigfund Growth Fund holds DEBT issued by Acme Finance Corp. is a subsidiary of Acme Corp");
        assertThat(full.byHolder()).extracting("holder.id").containsExactly("F00000201", "0000000002");
        assertThat(full.byInstrument()).filteredOn(l -> l.pathLength() == 4).singleElement()
                .satisfies(l -> assertThat(l.lineagePath()).extracting("id")
                        .containsExactly("F00000201", "0000000002", "S0000010101", "S00000101", "0000000001"));
    }

    @Test
    void exposureFlagsAndDepthNarrowTheAnswer() {
        assertThat(exposure("F00000201", "0000000001", "includeAffiliates=false").totalValue())
                .isEqualByComparingTo(new BigDecimal("49000.5"));
        assertThat(exposure("F00000201", "0000000001", "includeSubsidiaries=false").totalValue())
                .isEqualByComparingTo(new BigDecimal("1000.0"));
        assertThat(exposure("F00000201", "0000000001", "includeAffiliates=false&includeSubsidiaries=false")
                .totalValue()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(exposure("F00000201", "0000000001", "depth=1").totalValue())
                .isEqualByComparingTo(new BigDecimal("50000.5"));

        ExposureResponse direct = exposure("0000000002", "0000000001", "includeAffiliates=false");
        assertThat(direct.totalValue()).isEqualByComparingTo(new BigDecimal("1250.0"));
        assertThat(direct.directValue()).isEqualByComparingTo(new BigDecimal("1000.0"));
        assertThat(direct.byInstrument()).filteredOn(l -> l.direct()).singleElement()
                .satisfies(l -> assertThat(l.pathLength()).isEqualTo(1));
    }

    @Test
    void weightedExposureMultipliesOwnershipAlongThePath() {
        ExposureResponse plain = exposure("F00000201", "0000000001", "weighted=false");
        assertThat(plain.weighted()).isFalse();
        assertThat(plain.totalValue()).isEqualByComparingTo(new BigDecimal("50250.5"));
        assertThat(plain.byInstrument()).allSatisfy(l -> assertThat(l.weightedValue()).isNull());

        ExposureResponse weighted = exposure("F00000201", "0000000001", "weighted=true");
        assertThat(weighted.weighted()).isTrue();
        assertThat(weighted.totalValue()).isEqualByComparingTo(new BigDecimal("40350.40"));
        assertThat(weighted.viaSubsidiariesValue()).isEqualByComparingTo(new BigDecimal("39200.40"));
        assertThat(weighted.viaAffiliatesValue()).isEqualByComparingTo(new BigDecimal("1150.00"));
        assertThat(weighted.byInstrument()).filteredOn(l -> l.pathLength() == 4).singleElement()
                .satisfies(l -> {
                    assertThat(l.value()).isEqualByComparingTo(new BigDecimal("250.0"));
                    assertThat(l.weight()).isEqualByComparingTo(new BigDecimal("0.6"));
                    assertThat(l.weightedValue()).isEqualByComparingTo(new BigDecimal("150.00"));
                });
    }

    @Test
    void concentrationRanksIssuersAndHonoursTheShareThreshold() {
        ConcentrationResponse defaults = rest.getForObject(
                "/exposure/concentration?entity=0000000002", ConcentrationResponse.class);
        assertThat(defaults.totalValue()).isEqualByComparingTo(new BigDecimal("51027.5"));
        assertThat(defaults.minShare()).isEqualByComparingTo(new BigDecimal("0.01"));
        assertThat(defaults.issuers()).extracting(l -> l.issuer().id())
                .containsExactly("S00000101", "0000000001", "0000000003");
        assertThat(defaults.issuers().get(0).share())
                .isBetween(new BigDecimal("0.9602"), new BigDecimal("0.9603"));
        assertThat(defaults.issuersAboveShare()).isEqualTo(3);

        ConcentrationResponse strict = rest.getForObject(
                "/exposure/concentration?entity=0000000002&min_share=0.5", ConcentrationResponse.class);
        assertThat(strict.issuers()).extracting(l -> l.issuer().id()).containsExactly("S00000101");

        ConcentrationResponse capped = rest.getForObject(
                "/exposure/concentration?entity=0000000002&limit=1", ConcentrationResponse.class);
        assertThat(capped.issuers()).hasSize(1);
        assertThat(capped.issuersAboveShare()).isEqualTo(3);

        assertThat(rest.getForEntity("/exposure/concentration?entity=0000000002&min_share=2", String.class)
                .getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void tradesListPositionsOnEitherSide() {
        List<TradeRecord> held = rest.exchange("/trades?entity=0000000002", HttpMethod.GET, null,
                new ParameterizedTypeReference<List<TradeRecord>>() { }).getBody();
        assertThat(held).extracting(TradeRecord::value)
                .containsExactly(new BigDecimal("1000.0"), new BigDecimal("777.0"), new BigDecimal("250.0"));
        assertThat(held.get(0).accessionNumber()).isEqualTo("0000000002-24-000001");
        assertThat(held.get(0).formType()).isEqualTo("13F-HR");

        List<TradeRecord> issued = rest.exchange("/trades?entity=S00000101", HttpMethod.GET, null,
                new ParameterizedTypeReference<List<TradeRecord>>() { }).getBody();
        assertThat(issued).hasSize(1);
        assertThat(issued.get(0).holder().id()).isEqualTo("F00000201");
    }

    @Test
    void neighborsReturnLineageAndHoldingLinks() {
        NeighborGraph g = rest.getForObject("/graph/neighbors/0000000001", NeighborGraph.class);
        assertThat(g.center()).isEqualTo("0000000001");
        assertThat(g.nodes()).extracting(NeighborGraph.Node::id)
                .containsExactlyInAnyOrder("0000000001", "S00000101", "0000000002");
        assertThat(g.links()).extracting(NeighborGraph.Link::rel).containsExactlyInAnyOrder("subsidiaryOf", "holds");
        assertThat(g.links()).filteredOn(l -> l.rel().equals("holds")).singleElement()
                .satisfies(l -> {
                    assertThat(l.source()).isEqualTo("0000000002");
                    assertThat(l.weight()).isEqualByComparingTo(new BigDecimal("1000.0"));
                });
    }

    private ExposureResponse exposure(String fund, String issuer, String extra) {
        return rest.getForObject("/entities/" + fund + "/exposure?issuer=" + issuer + "&" + extra,
                ExposureResponse.class);
    }

    private List<EntitySummary> list(String url, Object... vars) {
        ResponseEntity<List<EntitySummary>> resp = rest.exchange(url, HttpMethod.GET, null,
                new ParameterizedTypeReference<List<EntitySummary>>() { }, vars);
        return resp.getBody();
    }
}
