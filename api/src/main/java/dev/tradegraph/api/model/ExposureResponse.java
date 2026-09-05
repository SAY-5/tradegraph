package dev.tradegraph.api.model;

import java.math.BigDecimal;
import java.util.List;

public record ExposureResponse(
        EntityRef fund,
        EntityRef issuer,
        BigDecimal totalValue,
        BigDecimal directValue,
        BigDecimal viaSubsidiariesValue,
        BigDecimal viaAffiliatesValue,
        long positions,
        boolean includeAffiliates,
        boolean includeSubsidiaries,
        int maxDepth,
        int longestPath,
        List<ExposureLine> byInstrument,
        List<HolderTotal> byHolder,
        long queryMillis) {
}
