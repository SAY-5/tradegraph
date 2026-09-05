package dev.tradegraph.api.sparql;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class QueryTemplatesTest {

    private final QueryTemplates templates = QueryTemplates.fromClasspath();

    @Test
    void loadsEveryTemplateFromClasspath() {
        for (String name : List.of("search", "entity", "entity_counts", "lineage_up", "lineage_down", "exposure",
                "trades", "neighbors", "stats", "ping")) {
            assertThat(templates.has(name)).as(name).isTrue();
        }
    }

    @Test
    void renderPrependsPrefixesAndSubstitutesPlaceholders() {
        String q = templates.render("entity", Map.of("iri", "<https://tradegraph.dev/entity/x>"));
        assertThat(q).startsWith("PREFIX tg: <https://tradegraph.dev/ontology#>");
        assertThat(q).contains("<https://tradegraph.dev/entity/x> a tg:LegalEntity");
        assertThat(q).doesNotContain("${");
    }

    @Test
    void renderFailsOnUnresolvedPlaceholder() {
        assertThatThrownBy(() -> templates.render("search", Map.of("q", "\"a\"")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("qLower");
    }

    @Test
    void renderFailsOnUnknownTemplate() {
        assertThatThrownBy(() -> templates.render("nope", Map.of())).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void placeholderValuesAreInsertedVerbatimSoDollarSignsSurvive() {
        QueryTemplates t = new QueryTemplates(Map.of("x", "SELECT ${v}"));
        assertThat(t.render("x", Map.of("v", "\"$1 \\\\ back\""))).endsWith("SELECT \"$1 \\\\ back\"");
    }
}
