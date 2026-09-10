package dev.tradegraph.api.sparql;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class SparqlValuesTest {

    @Test
    void entityIriWrapsValidatedId() {
        assertThat(SparqlValues.entityIri("0000320193")).isEqualTo("<https://tradegraph.dev/entity/0000320193>");
        assertThat(SparqlValues.entityIri("S00000101")).isEqualTo("<https://tradegraph.dev/entity/S00000101>");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "a b", "x> . ?s ?p ?o", "../etc", "0000320193>", "ünïcode", "a\"b"})
    void entityIriRejectsAnythingOutsideTheIdAlphabet(String bad) {
        assertThatThrownBy(() -> SparqlValues.entityIri(bad)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void literalEscapesQuotesBackslashesAndControlCharacters() {
        assertThat(SparqlValues.literal("plain")).isEqualTo("\"plain\"");
        assertThat(SparqlValues.literal("say \"hi\"")).isEqualTo("\"say \\\"hi\\\"\"");
        assertThat(SparqlValues.literal("back\\slash")).isEqualTo("\"back\\\\slash\"");
        assertThat(SparqlValues.literal("line\nbreak\ttab\r")).isEqualTo("\"line\\nbreak\\ttab\\r\"");
    }

    @Test
    void dateLiteralIsTyped() {
        assertThat(SparqlValues.date(LocalDate.of(2024, 6, 30))).isEqualTo("\"2024-06-30\"^^xsd:date");
    }

    @Test
    void valuesBlockIsEmptyWhenThereIsNothingToPin() {
        assertThat(SparqlValues.values("d", List.of())).isEqualTo("VALUES ?d {  }");
        assertThat(SparqlValues.values("d", List.of(SparqlValues.date(LocalDate.of(2024, 3, 31)))))
                .isEqualTo("VALUES ?d { \"2024-03-31\"^^xsd:date }");
    }

    @Test
    void literalNeutralisesInjectionAttempt() {
        String attack = "\") } ?s ?p ?o . FILTER(\"";
        String literal = SparqlValues.literal(attack);
        assertThat(literal).startsWith("\"").endsWith("\"");
        String inner = literal.substring(1, literal.length() - 1);
        assertThat(inner.replace("\\\"", "")).doesNotContain("\"");
    }
}
