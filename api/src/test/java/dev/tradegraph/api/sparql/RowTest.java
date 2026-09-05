package dev.tradegraph.api.sparql;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class RowTest {

    @Test
    void parsesTermsAndSplitsKinds() {
        Row row = new Row(Map.of(
                "e", new RdfTerm("uri", "https://tradegraph.dev/entity/S00000101", null, null),
                "types", new RdfTerm("literal", "https://tradegraph.dev/ontology#Issuer,"
                        + "https://tradegraph.dev/ontology#Fund", null, null),
                "value", new RdfTerm("literal", "49000.5", "http://www.w3.org/2001/XMLSchema#decimal", null),
                "asOf", new RdfTerm("literal", "2024-06-30", "http://www.w3.org/2001/XMLSchema#date", null)));
        assertThat(row.id("e")).isEqualTo("S00000101");
        assertThat(row.kinds("types")).isEqualTo(List.of("Fund", "Issuer"));
        assertThat(row.decimal("value")).isEqualByComparingTo(new BigDecimal("49000.5"));
        assertThat(row.date("asOf")).isEqualTo(LocalDate.of(2024, 6, 30));
        assertThat(row.str("missing")).isNull();
        assertThat(row.decimal("missing")).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(row.kinds("missing")).isEmpty();
    }
}
