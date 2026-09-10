package dev.tradegraph.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import dev.tradegraph.api.config.TradeGraphProperties;
import dev.tradegraph.api.model.EntityRef;
import dev.tradegraph.api.model.LineageNode;
import dev.tradegraph.api.sparql.QueryCostException;
import dev.tradegraph.api.sparql.QueryTemplates;
import dev.tradegraph.api.sparql.RdfTerm;
import dev.tradegraph.api.sparql.Row;
import dev.tradegraph.api.sparql.SparqlClient;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class LineageServiceTest {

    private static final String NS = "https://tradegraph.dev/entity/";

    private final SparqlClient sparql = mock(SparqlClient.class);
    private final LineageService service = new LineageService(sparql, QueryTemplates.fromClasspath(),
            mock(EntityService.class), new TradeGraphProperties(
                    new TradeGraphProperties.Store("fuseki", null, null, null, false, null, null),
                    new TradeGraphProperties.Lineage(5), null, null, null, null, null));

    private static Row edge(String child, String parent, String parentName) {
        return new Row(Map.of(
                "child", new RdfTerm("uri", NS + child, null, null),
                "parent", new RdfTerm("uri", NS + parent, null, null),
                "parentName", new RdfTerm("literal", parentName, null, null),
                "parentTypes", new RdfTerm("literal", "https://tradegraph.dev/ontology#Subsidiary", null, null)));
    }

    @Test
    void ancestorsAreOrderedNearestFirstRegardlessOfRowOrder() {
        when(sparql.select(anyString(), anyString())).thenReturn(List.of(
                edge("S00000101", "0000000001", "Acme Corp"),
                edge("S0000010101", "S00000101", "Acme Finance Corp.")));

        List<EntityRef> chain = service.ancestors("S0000010101", 5);

        assertThat(chain).extracting(EntityRef::id).containsExactly("S00000101", "0000000001");
        assertThat(chain.get(0).kinds()).containsExactly("Subsidiary");
    }

    @Test
    void ancestorsAreCutAtDepth() {
        when(sparql.select(anyString(), anyString())).thenReturn(List.of(
                edge("S00000101", "0000000001", "Acme Corp"),
                edge("S0000010101", "S00000101", "Acme Finance Corp.")));

        assertThat(service.ancestors("S0000010101", 1)).extracting(EntityRef::id).containsExactly("S00000101");
    }

    @Test
    void descendantsBuildTreeFromEdgesAndRespectDepth() {
        Row level1 = new Row(Map.of(
                "parent", new RdfTerm("uri", NS + "0000000001", null, null),
                "child", new RdfTerm("uri", NS + "S00000101", null, null),
                "childName", new RdfTerm("literal", "Acme Finance Corp.", null, null),
                "childTypes", new RdfTerm("literal", "https://tradegraph.dev/ontology#Subsidiary", null, null)));
        Row level2 = new Row(Map.of(
                "parent", new RdfTerm("uri", NS + "S00000101", null, null),
                "child", new RdfTerm("uri", NS + "S0000010101", null, null),
                "childName", new RdfTerm("literal", "Acme Regional Unit 1 Ltd.", null, null),
                "childTypes", new RdfTerm("literal", "https://tradegraph.dev/ontology#Subsidiary", null, null)));
        when(sparql.select(anyString(), anyString())).thenReturn(List.of(level2, level1));
        EntityRef acme = new EntityRef("0000000001", "Acme Corp", List.of("Issuer"));

        LineageNode full = service.descendants(acme, 5);
        assertThat(full.size()).isEqualTo(3);
        assertThat(full.maxDepth()).isEqualTo(2);
        assertThat(full.children().get(0).children().get(0).id()).isEqualTo("S0000010101");

        LineageNode shallow = service.descendants(acme, 1);
        assertThat(shallow.size()).isEqualTo(2);
        assertThat(shallow.children().get(0).children()).isEmpty();
    }

    @Test
    void clampDepthStaysWithinConfiguredMaximum() {
        assertThat(service.clampDepth(null)).isEqualTo(5);
        assertThat(service.clampDepth(0)).isEqualTo(1);
        assertThat(service.clampDepth(3)).isEqualTo(3);
        assertThatThrownBy(() -> service.clampDepth(99)).isInstanceOf(QueryCostException.class);
    }
}
