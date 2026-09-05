package dev.tradegraph.api.model;

import java.math.BigDecimal;
import java.time.LocalDate;

public record TradeRecord(
        String id,
        EntityRef holder,
        EntityRef issuer,
        Instrument instrument,
        BigDecimal quantity,
        BigDecimal value,
        LocalDate asOf,
        String accessionNumber,
        String formType) {
}
