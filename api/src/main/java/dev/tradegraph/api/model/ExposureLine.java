package dev.tradegraph.api.model;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record ExposureLine(
        Instrument instrument,
        EntityRef holder,
        EntityRef issuerEntity,
        BigDecimal value,
        BigDecimal quantity,
        long positions,
        LocalDate asOf,
        boolean direct,
        boolean viaAffiliate,
        boolean viaSubsidiary,
        int pathLength,
        List<PathStep> lineagePath,
        String explanation,
        BigDecimal weight,
        BigDecimal weightedValue) {

    /** The same line with the ownership weight of its path and the value that weight leaves. */
    public ExposureLine weighted(BigDecimal ownership, BigDecimal weighted) {
        return new ExposureLine(instrument, holder, issuerEntity, value, quantity, positions, asOf, direct,
                viaAffiliate, viaSubsidiary, pathLength, lineagePath, explanation, ownership, weighted);
    }
}
