package dev.tradegraph.api.model;

import java.math.BigDecimal;

/** One issuer in a concentration report, with its share of the holder's total value. */
public record ConcentrationLine(
        EntityRef issuer,
        BigDecimal value,
        BigDecimal share,
        long positions) {
}
