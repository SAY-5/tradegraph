package dev.tradegraph.api.model;

import java.math.BigDecimal;

public record HolderTotal(EntityRef holder, BigDecimal value, long positions) {
}
