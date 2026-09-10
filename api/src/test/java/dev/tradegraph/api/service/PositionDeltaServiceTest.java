package dev.tradegraph.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import dev.tradegraph.api.model.EntityRef;
import dev.tradegraph.api.model.Instrument;
import dev.tradegraph.api.model.PositionDelta;
import dev.tradegraph.api.model.PositionLine;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class PositionDeltaServiceTest {

    private static final EntityRef FUND = new EntityRef("F00000201", "Bigfund Growth Fund", List.of("Fund"));
    private static final EntityRef ACME = new EntityRef("0000000001", "Acme Corp", List.of("Issuer"));
    private static final LocalDate Q1 = LocalDate.of(2024, 3, 31);
    private static final LocalDate Q2 = LocalDate.of(2024, 6, 30);

    private static PositionLine line(String cusip, String value, String quantity) {
        return new PositionLine(new Instrument(cusip, "ACME", "COMMON"), ACME,
                new BigDecimal(value), new BigDecimal(quantity), 1);
    }

    private static Map<String, PositionLine> book(PositionLine... lines) {
        Map<String, PositionLine> map = new LinkedHashMap<>();
        for (PositionLine l : lines) {
            map.put(l.instrument().cusip(), l);
        }
        return map;
    }

    @Test
    void splitsTheTwoBooksIntoAddedRemovedAndChanged() {
        PositionDelta delta = PositionDeltaService.build(FUND, Q1, Q2,
                book(line("900000001", "1000", "100"), line("900000002", "400", "4000")),
                book(line("900000001", "1500", "120"), line("900000003", "700", "70")), 7);

        assertThat(delta.added()).extracting(l -> l.instrument().cusip()).containsExactly("900000003");
        assertThat(delta.removed()).extracting(l -> l.instrument().cusip()).containsExactly("900000002");
        assertThat(delta.changed()).singleElement().satisfies(c -> {
            assertThat(c.instrument().cusip()).isEqualTo("900000001");
            assertThat(c.fromValue()).isEqualByComparingTo("1000");
            assertThat(c.toValue()).isEqualByComparingTo("1500");
            assertThat(c.valueChange()).isEqualByComparingTo("500");
        });
        assertThat(delta.addedValue()).isEqualByComparingTo("700");
        assertThat(delta.removedValue()).isEqualByComparingTo("400");
        assertThat(delta.changedValue()).isEqualByComparingTo("500");
    }

    @Test
    void aLineThatDidNotMoveIsNotReported() {
        PositionDelta delta = PositionDeltaService.build(FUND, Q1, Q2,
                book(line("900000001", "1000", "100")),
                book(line("900000001", "1000.00", "100")), 1);

        assertThat(delta.added()).isEmpty();
        assertThat(delta.removed()).isEmpty();
        assertThat(delta.changed()).isEmpty();
        assertThat(delta.changedValue()).isEqualByComparingTo("0");
    }

    @Test
    void quantityMovesAlone() {
        PositionDelta delta = PositionDeltaService.build(FUND, Q1, Q2,
                book(line("900000001", "1000", "100")),
                book(line("900000001", "1000", "150")), 1);

        assertThat(delta.changed()).singleElement().satisfies(c -> {
            assertThat(c.fromQuantity()).isEqualByComparingTo("100");
            assertThat(c.toQuantity()).isEqualByComparingTo("150");
            assertThat(c.valueChange()).isEqualByComparingTo("0");
        });
    }
}
