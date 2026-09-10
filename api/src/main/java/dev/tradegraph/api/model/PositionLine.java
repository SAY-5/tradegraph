package dev.tradegraph.api.model;

import java.math.BigDecimal;

/** One instrument line of a holder in a single reporting period. */
public record PositionLine(
        Instrument instrument,
        EntityRef issuer,
        BigDecimal value,
        BigDecimal quantity,
        long positions) {
}
