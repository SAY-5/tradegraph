package dev.tradegraph.api.model;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** What changed in a holder's reported book between two reporting periods. */
public record PositionDelta(
        EntityRef entity,
        LocalDate from,
        LocalDate to,
        List<PositionLine> added,
        List<PositionLine> removed,
        List<PositionChange> changed,
        BigDecimal addedValue,
        BigDecimal removedValue,
        BigDecimal changedValue,
        long queryMillis) {
}
