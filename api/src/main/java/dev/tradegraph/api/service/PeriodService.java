package dev.tradegraph.api.service;

import dev.tradegraph.api.sparql.QueryTemplates;
import dev.tradegraph.api.sparql.SparqlClient;
import dev.tradegraph.api.sparql.SparqlValues;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

/**
 * Reporting periods held in the store. A 13F-HR is filed for a quarter end, so every position
 * carries the period of the filing it came from and a query that does not pin a period would
 * sum the same holding once per quarter.
 */
@Service
public class PeriodService {

    private final SparqlClient sparql;
    private final QueryTemplates templates;

    public PeriodService(SparqlClient sparql, QueryTemplates templates) {
        this.sparql = sparql;
        this.templates = templates;
    }

    /** Periods present in the store, newest first. */
    @Cacheable("periods")
    public List<LocalDate> periods() {
        return sparql.select(templates.render("periods", Map.of())).stream()
                .map(r -> r.date("period"))
                .filter(Objects::nonNull)
                .toList();
    }

    /**
     * The period an {@code asOf} request answers over: the latest period on or before the
     * requested date, or the latest period of all when no date was requested. Empty when the
     * store has no positions or when every period is later than the requested date.
     */
    public Optional<LocalDate> resolve(LocalDate asOf) {
        List<LocalDate> all = periods();
        if (asOf == null) {
            return all.stream().findFirst();
        }
        return all.stream().filter(p -> !p.isAfter(asOf)).findFirst();
    }

    /** {@code VALUES ?var { ... }} pinning a query to the period an {@code asOf} request resolves to. */
    public String valuesBlock(String variable, LocalDate asOf) {
        return valuesBlock(variable, resolve(asOf));
    }

    public String valuesBlock(String variable, Optional<LocalDate> period) {
        return SparqlValues.values(variable, period.map(SparqlValues::date).stream().toList());
    }
}
