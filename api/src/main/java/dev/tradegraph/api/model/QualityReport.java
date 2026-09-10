package dev.tradegraph.api.model;

import java.time.Instant;
import java.util.List;

/** The report written by {@code tradegraph-etl validate} for the data that was last loaded. */
public record QualityReport(
        Instant checkedAt,
        boolean conforms,
        long entities,
        long positions,
        long danglingReferences,
        long subsidiaryCycles,
        long missingIdentifiers,
        long shaclViolations,
        List<String> findings) {
}
