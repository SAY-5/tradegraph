package dev.tradegraph.api.service;

import dev.tradegraph.api.model.EntityRef;
import dev.tradegraph.api.model.Instrument;
import dev.tradegraph.api.model.PositionChange;
import dev.tradegraph.api.model.PositionDelta;
import dev.tradegraph.api.model.PositionLine;
import dev.tradegraph.api.sparql.QueryTemplates;
import dev.tradegraph.api.sparql.Row;
import dev.tradegraph.api.sparql.SparqlClient;
import dev.tradegraph.api.sparql.SparqlValues;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

/**
 * What a holder reported differently between two periods. One query returns both periods
 * grouped by instrument, and the two books are matched on CUSIP: a line only in the later
 * book was opened, a line only in the earlier book was closed, and a line in both whose
 * value or quantity moved is a change.
 */
@Service
public class PositionDeltaService {

    private final SparqlClient sparql;
    private final QueryTemplates templates;
    private final EntityService entities;
    private final PeriodService periods;

    public PositionDeltaService(SparqlClient sparql, QueryTemplates templates, EntityService entities,
            PeriodService periods) {
        this.sparql = sparql;
        this.templates = templates;
        this.entities = entities;
        this.periods = periods;
    }

    @Cacheable("delta")
    public PositionDelta delta(String entityId, LocalDate from, LocalDate to) {
        long started = System.nanoTime();
        LocalDate fromPeriod = periods.resolve(from).orElse(null);
        LocalDate toPeriod = periods.resolve(to).orElse(null);
        if (fromPeriod != null && toPeriod != null && fromPeriod.isAfter(toPeriod)) {
            throw new IllegalArgumentException("from period " + fromPeriod + " is after to period " + toPeriod);
        }
        EntityRef entity = entities.ref(entityId);
        String query = templates.render("positions_delta", Map.of(
                "iri", SparqlValues.entityIri(entityId),
                "periodValues", SparqlValues.values("period", datesOf(fromPeriod, toPeriod))));

        Map<String, PositionLine> before = new LinkedHashMap<>();
        Map<String, PositionLine> after = new LinkedHashMap<>();
        for (Row r : sparql.select(query)) {
            LocalDate period = r.date("period");
            PositionLine line = toLine(r);
            if (period == null) {
                continue;
            }
            if (period.equals(fromPeriod)) {
                before.put(line.instrument().cusip(), line);
            }
            if (period.equals(toPeriod)) {
                after.put(line.instrument().cusip(), line);
            }
        }
        return build(entity, fromPeriod, toPeriod, before, after, (System.nanoTime() - started) / 1_000_000);
    }

    private static List<String> datesOf(LocalDate from, LocalDate to) {
        List<String> dates = new ArrayList<>();
        if (from != null) {
            dates.add(SparqlValues.date(from));
        }
        if (to != null && !to.equals(from)) {
            dates.add(SparqlValues.date(to));
        }
        return dates;
    }

    static PositionDelta build(EntityRef entity, LocalDate from, LocalDate to, Map<String, PositionLine> before,
            Map<String, PositionLine> after, long millis) {
        List<PositionLine> added = new ArrayList<>();
        List<PositionLine> removed = new ArrayList<>();
        List<PositionChange> changed = new ArrayList<>();
        BigDecimal addedValue = BigDecimal.ZERO;
        BigDecimal removedValue = BigDecimal.ZERO;
        BigDecimal changedValue = BigDecimal.ZERO;
        for (Map.Entry<String, PositionLine> e : after.entrySet()) {
            PositionLine was = before.get(e.getKey());
            PositionLine now = e.getValue();
            if (was == null) {
                added.add(now);
                addedValue = addedValue.add(now.value());
            } else if (was.value().compareTo(now.value()) != 0 || was.quantity().compareTo(now.quantity()) != 0) {
                BigDecimal move = now.value().subtract(was.value());
                changed.add(new PositionChange(now.instrument(), now.issuer(), was.value(), now.value(), move,
                        was.quantity(), now.quantity()));
                changedValue = changedValue.add(move);
            }
        }
        for (Map.Entry<String, PositionLine> e : before.entrySet()) {
            if (!after.containsKey(e.getKey())) {
                removed.add(e.getValue());
                removedValue = removedValue.add(e.getValue().value());
            }
        }
        return new PositionDelta(entity, from, to, added, removed, changed, addedValue, removedValue, changedValue,
                millis);
    }

    private static PositionLine toLine(Row r) {
        return new PositionLine(
                new Instrument(r.str("cusip"), r.str("ticker"), r.str("class")),
                new EntityRef(r.id("issuerEntity"), r.str("issuerEntityName"), List.of()),
                r.decimal("value"),
                r.decimal("quantity"),
                r.asLong("positions"));
    }
}
