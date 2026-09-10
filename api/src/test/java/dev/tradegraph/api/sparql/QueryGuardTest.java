package dev.tradegraph.api.sparql;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class QueryGuardTest {

    @Test
    void depthDefaultsToTheMaximumAndRaisesAnythingBelowOne() {
        assertThat(QueryGuard.depth(null, 4, "exposure")).isEqualTo(4);
        assertThat(QueryGuard.depth(2, 4, "exposure")).isEqualTo(2);
        assertThat(QueryGuard.depth(0, 4, "exposure")).isEqualTo(1);
        assertThat(QueryGuard.depth(-3, 5, "lineage")).isEqualTo(1);
    }

    @Test
    void depthAboveTheConfiguredMaximumIsRejected() {
        assertThatThrownBy(() -> QueryGuard.depth(9, 4, "exposure"))
                .isInstanceOf(QueryCostException.class)
                .hasMessage("exposure depth 9 is above the configured maximum of 4");
        assertThatThrownBy(() -> QueryGuard.depth(6, 5, "lineage"))
                .isInstanceOf(QueryCostException.class)
                .hasMessageContaining("lineage depth 6");
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "SELECT ?a WHERE { ?a tg:subsidiaryOf* ?b }",
        "SELECT ?a WHERE { ?a tg:subsidiaryOf+ ?b }",
        "SELECT ?a WHERE { ?a (tg:subsidiaryOf/tg:hasSubsidiary)+ ?b }",
        "SELECT ?a WHERE { ?a <https://tradegraph.dev/ontology#subsidiaryOf>* ?b }",
    })
    void unboundedPathsAreRejected(String query) {
        assertThatThrownBy(() -> QueryGuard.rejectUnboundedPaths(query))
                .isInstanceOf(QueryCostException.class)
                .hasMessage("query walks an unbounded property path");
    }

    @Test
    void everyShippedTemplateIsWithinBudget() {
        QueryTemplates templates = QueryTemplates.fromClasspath();
        String bounded = SparqlPaths.bounded(SparqlPaths.SUBSIDIARY_OF, 1, 4);
        assertThatCode(() -> {
            QueryGuard.rejectUnboundedPaths(templates.render("stats", Map.of()));
            QueryGuard.rejectUnboundedPaths(templates.render("periods", Map.of()));
            QueryGuard.rejectUnboundedPaths(templates.render("lineage_up", Map.of(
                    "iri", "<https://tradegraph.dev/entity/0000000001>",
                    "depth", "4",
                    "directOnly", "",
                    "moreChildren", "UNION { <https://tradegraph.dev/entity/0000000001> " + bounded + " ?child }")));
        }).doesNotThrowAnyException();
    }
}
