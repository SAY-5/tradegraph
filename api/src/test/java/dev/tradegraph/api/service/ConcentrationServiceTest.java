package dev.tradegraph.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import dev.tradegraph.api.model.ConcentrationLine;
import dev.tradegraph.api.model.EntityRef;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class ConcentrationServiceTest {

    private static final List<ConcentrationLine> BOOK = List.of(
            line("0000000003", "Other Holdings plc", "50"),
            line("0000000001", "Acme Corp", "800"),
            line("S00000101", "Acme Finance Corp.", "150"));

    private static ConcentrationLine line(String id, String name, String value) {
        return new ConcentrationLine(new EntityRef(id, name, List.of()), new BigDecimal(value), BigDecimal.ZERO, 1);
    }

    @Test
    void sharesAreOfTheTotalAndTheOrderIsByValue() {
        List<ConcentrationLine> above = ConcentrationService.above(BOOK, new BigDecimal("1000"), BigDecimal.ZERO);
        assertThat(above).extracting(l -> l.issuer().id())
                .containsExactly("0000000001", "S00000101", "0000000003");
        assertThat(above.get(0).share()).isEqualByComparingTo("0.8");
        assertThat(above.get(2).share()).isEqualByComparingTo("0.05");
    }

    @Test
    void thresholdDropsEverythingBelowTheShare() {
        assertThat(ConcentrationService.above(BOOK, new BigDecimal("1000"), new BigDecimal("0.10")))
                .extracting(l -> l.issuer().id()).containsExactly("0000000001", "S00000101");
        assertThat(ConcentrationService.above(BOOK, new BigDecimal("1000"), new BigDecimal("0.15")))
                .extracting(l -> l.issuer().id()).containsExactly("0000000001", "S00000101");
        assertThat(ConcentrationService.above(BOOK, new BigDecimal("1000"), new BigDecimal("0.5")))
                .extracting(l -> l.issuer().id()).containsExactly("0000000001");
    }

    @Test
    void anEmptyBookHasNoConcentration() {
        assertThat(ConcentrationService.above(List.of(), BigDecimal.ZERO, BigDecimal.ZERO)).isEmpty();
    }
}
