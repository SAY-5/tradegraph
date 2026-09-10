package dev.tradegraph.api.sparql;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class SparqlPathsTest {

    @Test
    void boundedExpandsIntoAlternativeOfFixedLengthSequences() {
        assertThat(SparqlPaths.bounded("p", 1, 1)).isEqualTo("(p)");
        assertThat(SparqlPaths.bounded("p", 1, 3)).isEqualTo("(p|p/p|p/p/p)");
        assertThat(SparqlPaths.bounded("p", 2, 3)).isEqualTo("(p/p|p/p/p)");
    }

    @Test
    void boundedIsEmptyWhenNoHopsAllowed() {
        assertThat(SparqlPaths.bounded("p", 1, 0)).isEmpty();
        assertThatThrownBy(() -> SparqlPaths.bounded("p", 0, 1)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void unionHopsWrapsPathInUnionBlock() {
        assertThat(SparqlPaths.unionHops("<x>", "?c", 1, 2))
                .isEqualTo("UNION { <x> (tg:subsidiaryOf|tg:subsidiaryOf/tg:subsidiaryOf) ?c }");
        assertThat(SparqlPaths.unionHops("<x>", "?c", 1, 0)).isEmpty();
    }

    @Test
    void aStoreThatMaterialisesTheClosureNeedsOneHop() {
        assertThat(SparqlPaths.bounded("tg:subsidiaryOf", 1, 4, true)).isEqualTo("tg:subsidiaryOf");
        assertThat(SparqlPaths.unionHops("<f>", "?root", 1, 4, true))
                .isEqualTo("UNION { <f> tg:subsidiaryOf ?root }");
        assertThat(SparqlPaths.bounded("tg:subsidiaryOf", 1, 0, true)).isEmpty();
        assertThat(SparqlPaths.bounded("tg:subsidiaryOf", 1, 2, false))
                .isEqualTo("(tg:subsidiaryOf|tg:subsidiaryOf/tg:subsidiaryOf)");
    }
}
