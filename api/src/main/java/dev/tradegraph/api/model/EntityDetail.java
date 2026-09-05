package dev.tradegraph.api.model;

import java.math.BigDecimal;
import java.util.List;

public record EntityDetail(
        String id,
        String name,
        List<String> kinds,
        String ticker,
        String cik,
        String lei,
        String jurisdiction,
        EntityRef parent,
        long subsidiaries,
        long positionsHeld,
        BigDecimal valueHeld,
        long positionsIssued,
        BigDecimal valueIssued) {
}
