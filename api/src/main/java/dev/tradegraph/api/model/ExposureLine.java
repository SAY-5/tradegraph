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
        String explanation) {
}
