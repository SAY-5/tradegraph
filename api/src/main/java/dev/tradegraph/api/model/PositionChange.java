package dev.tradegraph.api.model;

import java.math.BigDecimal;

/** An instrument line held in both periods whose reported value or quantity moved. */
public record PositionChange(
        Instrument instrument,
        EntityRef issuer,
        BigDecimal fromValue,
        BigDecimal toValue,
        BigDecimal valueChange,
        BigDecimal fromQuantity,
        BigDecimal toQuantity) {
}
