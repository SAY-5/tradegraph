package dev.tradegraph.api.it;

import static org.assertj.core.api.Assertions.assertThat;

import dev.tradegraph.api.service.ExposureService;
import dev.tradegraph.api.sparql.QueryMetrics;
import dev.tradegraph.api.sparql.QueryTemplates;
import dev.tradegraph.api.sparql.Row;
import dev.tradegraph.api.sparql.SparqlClient;
import dev.tradegraph.api.sparql.SparqlValues;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;
import org.testcontainers.containers.GenericContainer;

/**
 * Parity between the two ways of walking lineage. Against a plain store the API expands
 * {@code subsidiaryOf} into a bounded alternation of fixed length sequences; against a store
 * that materialises the closure, which is what Stardog does with {@code reasoning=true} and
 * what the assembler in {@code deploy/fuseki} makes Fuseki do, one hop is enough. The same
 * exposure question has to come back with the same total either way.
 */
class ReasoningParityIT {

    private static final GenericContainer<?> FUSEKI = FusekiSupport.startWithInference();
    private static final String PREFIX = "PREFIX tg: <https://tradegraph.dev/ontology#>\n";
    private static final String FUND = SparqlValues.entityIri("F00000201");
    private static final String ISSUER = SparqlValues.entityIri("0000000001");
    private static final int DEPTH = 4;
    private static final LocalDate PERIOD = LocalDate.of(2024, 6, 30);

    private static QueryTemplates templates;
    private static SparqlClient plain;
    private static SparqlClient reasoning;

    @BeforeAll
    static void loadFixture() {
        FusekiSupport.loadFixture(FUSEKI);
        templates = QueryTemplates.fromClasspath();
        plain = client(FusekiSupport.queryUrl(FUSEKI));
        reasoning = client(FusekiSupport.inferenceQueryUrl(FUSEKI));
    }

    private static SparqlClient client(String url) {
        return new SparqlClient(RestClient.builder().baseUrl(url).build(), false,
                new QueryMetrics(new SimpleMeterRegistry(), 8));
    }

    @Test
    void theInferenceServiceMaterialisesTransitivityAndTheInverse() {
        String twoHopsUp = PREFIX + "ASK { " + SparqlValues.entityIri("S0000010101")
                + " tg:subsidiaryOf " + ISSUER + " }";
        String twoHopsDown = PREFIX + "ASK { " + ISSUER + " tg:hasSubsidiary "
                + SparqlValues.entityIri("S0000010101") + " }";

        assertThat(plain.ask("parity", twoHopsUp)).isFalse();
        assertThat(plain.ask("parity", twoHopsDown)).isFalse();
        assertThat(reasoning.ask("parity", twoHopsUp)).isTrue();
        assertThat(reasoning.ask("parity", twoHopsDown)).isTrue();
    }

    @Test
    void exposureTotalsAgreeWithReasoningOnAndWithTheExplicitPropertyPath() {
        BigDecimal viaPaths = total(plain, false);
        BigDecimal viaReasoning = total(reasoning, true);

        assertThat(viaPaths).isEqualByComparingTo(new BigDecimal("50250.5"));
        assertThat(viaReasoning).isEqualByComparingTo(viaPaths);
    }

    @Test
    void theReasoningQueryIsShorterThanTheBoundedAlternation() {
        assertThat(ExposureService.holderClause(FUND, true, DEPTH, true))
                .contains("UNION { " + FUND + " tg:subsidiaryOf ?root }")
                .doesNotContain("tg:subsidiaryOf/tg:subsidiaryOf");
        assertThat(ExposureService.holderClause(FUND, true, DEPTH, false))
                .contains("tg:subsidiaryOf/tg:subsidiaryOf");
    }

    private static BigDecimal total(SparqlClient client, boolean closure) {
        String query = templates.render("exposure", Map.of(
                "fund", FUND,
                "issuer", ISSUER,
                "depth", SparqlValues.integer(DEPTH),
                "periodValues", SparqlValues.values("d", List.of(SparqlValues.date(PERIOD))),
                "holderClause", ExposureService.holderClause(FUND, true, DEPTH, closure),
                "issuerClause", ExposureService.issuerClause(ISSUER, true, DEPTH, closure)));
        BigDecimal total = BigDecimal.ZERO;
        for (Row r : client.select("exposure", query)) {
            total = total.add(r.decimal("value"));
        }
        return total;
    }
}
