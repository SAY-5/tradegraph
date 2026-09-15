package dev.tradegraph.api.sparql;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class QueryGuardTest {

    private static final List<String> TEMPLATES = List.of("search", "entity", "entity_counts",
            "lineage_up", "lineage_down", "exposure", "concentration", "ownership", "trades",
            "neighbors", "periods", "positions_delta", "stats", "ping", "prefixes");

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
    void everyShippedTemplateIsCheckedWhenItLoads() {
        // fromClasspath runs the check over every template; reaching this line means all of
        // them passed, and the loop states the invariant for a reader.
        QueryTemplates templates = QueryTemplates.fromClasspath();
        for (String name : TEMPLATES) {
            assertThat(templates.has(name)).as(name).isTrue();
        }
        assertThatCode(QueryTemplates::fromClasspath).doesNotThrowAnyException();
    }

    @Test
    void aTemplateThatShipsAnUnboundedPathIsRejectedWhenItLoads() {
        assertThatThrownBy(() -> new QueryTemplates(
                Map.of("lineage_all", "SELECT ?a WHERE { ?a tg:subsidiaryOf+ ?b }")))
                .isInstanceOf(QueryCostException.class)
                .hasMessage("lineage_all.rq walks an unbounded property path");
    }

    @Test
    void theGeneratedPathFragmentsAreBounded() {
        for (int depth = 1; depth <= 5; depth++) {
            String bounded = SparqlPaths.bounded(SparqlPaths.SUBSIDIARY_OF, 1, depth);
            int at = depth;
            assertThatCode(() -> QueryGuard.rejectUnboundedPaths("depth " + at, bounded))
                    .doesNotThrowAnyException();
        }
        assertThatCode(() -> QueryGuard.rejectUnboundedPaths(
                SparqlPaths.unionHops("?a", "?b", 1, 4, false))).doesNotThrowAnyException();
    }

    @Test
    void aSearchTermThatLooksLikeAPathIsNotAQueryDefect() {
        // The reason the check moved to load time: this is a rendered search clause, and the
        // pattern matches inside the quoted literal a caller typed.
        String rendered = "FILTER(CONTAINS(LCASE(?name), \"tg:x+\"))";
        assertThatThrownBy(() -> QueryGuard.rejectUnboundedPaths(rendered))
                .isInstanceOf(QueryCostException.class);
        assertThatCode(() -> QueryTemplates.fromClasspath().render("search", Map.of(
                "q", "\"tg:x+\"",
                "qLower", "\"tg:x+\"",
                "limit", "20"))).doesNotThrowAnyException();
    }
}
