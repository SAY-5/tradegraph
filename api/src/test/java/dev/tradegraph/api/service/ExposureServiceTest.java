package dev.tradegraph.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import dev.tradegraph.api.config.TradeGraphProperties;
import dev.tradegraph.api.model.EntityRef;
import dev.tradegraph.api.model.Instrument;
import dev.tradegraph.api.model.PathStep;
import dev.tradegraph.api.sparql.QueryTemplates;
import dev.tradegraph.api.sparql.SparqlClient;
import java.util.List;
import org.junit.jupiter.api.Test;

class ExposureServiceTest {

    private static final EntityRef ACME = new EntityRef("0000000001", "Acme Corp", List.of("Issuer"));
    private static final EntityRef ACME_FIN = new EntityRef("S00000101", "Acme Finance Corp.", List.of("Subsidiary"));
    private static final EntityRef BIGFUND = new EntityRef("0000000002", "Bigfund Inc", List.of("Fund"));
    private static final EntityRef GROWTH = new EntityRef("F00000201", "Bigfund Growth Fund", List.of("Fund"));

    private final LineageService lineage = mock(LineageService.class);
    private final ExposureService service = new ExposureService(mock(SparqlClient.class),
            mock(QueryTemplates.class), mock(EntityService.class), lineage, mock(PeriodService.class),
            mock(OwnershipService.class), mock(TradeGraphProperties.class));

    @Test
    void holderClauseBindsFundDirectlyWithoutAffiliates() {
        assertThat(ExposureService.holderClause("<f>", false, 3, false)).isEqualTo("BIND(<f> AS ?holder)");
    }

    @Test
    void holderClauseWalksToRootAndBackDownWithAffiliates() {
        String clause = ExposureService.holderClause("<f>", true, 2, false);
        String twoHops = "(tg:subsidiaryOf|tg:subsidiaryOf/tg:subsidiaryOf)";
        assertThat(clause).contains("{ BIND(<f> AS ?root) } UNION { <f> " + twoHops + " ?root }");
        assertThat(clause).contains("FILTER NOT EXISTS { ?root tg:subsidiaryOf ?above }");
        assertThat(clause).contains("?holder a tg:Fund .");
        assertThat(clause).contains("FILTER(?holder = ?root || EXISTS { ?holder " + twoHops + " ?root })");
        assertThat(clause).contains("?holder a tg:Fund .");
    }

    @Test
    void issuerClauseIncludesBoundedSubsidiaryPath() {
        assertThat(ExposureService.issuerClause("<i>", false, 3, false)).isEqualTo("BIND(<i> AS ?issuerEntity)");
        assertThat(ExposureService.issuerClause("<i>", true, 1, false))
                .isEqualTo("{ BIND(<i> AS ?issuerEntity) } UNION { ?issuerEntity (tg:subsidiaryOf) <i> }");
    }

    @Test
    void directPathHasOneHop() {
        List<PathStep> path = service.buildPath(BIGFUND, BIGFUND, ACME, ACME, 4);
        assertThat(path).extracting(PathStep::hop).containsExactly(PathStep.START, PathStep.HOLDS);
        assertThat(path).extracting(PathStep::id).containsExactly("0000000002", "0000000001");
    }

    @Test
    void affiliateAndSubsidiaryPathIsOrdered() {
        when(lineage.ancestors(eq("F00000201"), anyInt())).thenReturn(List.of(BIGFUND));
        when(lineage.ancestors(eq("0000000002"), anyInt())).thenReturn(List.of());
        when(lineage.ancestors(eq("S00000101"), anyInt())).thenReturn(List.of(ACME));

        List<PathStep> path = service.buildPath(GROWTH, BIGFUND, ACME_FIN, ACME, 4);

        assertThat(path).extracting(PathStep::id)
                .containsExactly("F00000201", "0000000002", "S00000101", "0000000001");
        assertThat(path).extracting(PathStep::hop)
                .containsExactly(PathStep.START, PathStep.PARENT, PathStep.HOLDS, PathStep.PARENT);
        String text = ExposureService.explain(path, new Instrument("900000002", null, "DEBT"));
        assertThat(text).isEqualTo("Bigfund Growth Fund is a subsidiary of Bigfund Inc holds DEBT issued by "
                + "Acme Finance Corp. is a subsidiary of Acme Corp");
    }

    @Test
    void siblingFundPathGoesUpToRootThenDown() {
        EntityRef sibling = new EntityRef("F00000202", "Bigfund Value Fund", List.of("Fund"));
        when(lineage.ancestors(eq("F00000201"), anyInt())).thenReturn(List.of(BIGFUND));
        when(lineage.ancestors(eq("F00000202"), anyInt())).thenReturn(List.of(BIGFUND));

        List<PathStep> path = service.buildPath(GROWTH, sibling, ACME, ACME, 4);

        assertThat(path).extracting(PathStep::id)
                .containsExactly("F00000201", "0000000002", "F00000202", "0000000001");
        assertThat(path).extracting(PathStep::hop)
                .containsExactly(PathStep.START, PathStep.PARENT, PathStep.SUBSIDIARY, PathStep.HOLDS);
    }
}
