package dev.tradegraph.api.model;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** Issuers that make up at least {@code minShare} of what a fund family holds. */
public record ConcentrationResponse(
        EntityRef entity,
        LocalDate asOf,
        BigDecimal totalValue,
        BigDecimal minShare,
        int issuersAboveShare,
        List<ConcentrationLine> issuers,
        long queryMillis) {
}
