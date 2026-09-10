package dev.tradegraph.api.service;

import dev.tradegraph.api.model.EntityRef;
import dev.tradegraph.api.model.Instrument;
import dev.tradegraph.api.model.TradeRecord;
import dev.tradegraph.api.sparql.QueryTemplates;
import dev.tradegraph.api.sparql.SparqlClient;
import dev.tradegraph.api.sparql.SparqlValues;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

@Service
public class TradeService {

    private final SparqlClient sparql;
    private final QueryTemplates templates;
    private final PeriodService periods;

    public TradeService(SparqlClient sparql, QueryTemplates templates, PeriodService periods) {
        this.sparql = sparql;
        this.templates = templates;
        this.periods = periods;
    }

    @Cacheable("trades")
    public List<TradeRecord> forEntity(String id, int limit, int offset, LocalDate asOf) {
        String query = templates.render("trades", Map.of(
                "iri", SparqlValues.entityIri(id),
                "periodValues", periods.valuesBlock("asOf", asOf),
                "limit", SparqlValues.integer(Math.min(Math.max(limit, 1), 500)),
                "offset", SparqlValues.integer(Math.max(offset, 0))));
        return sparql.select("trades", query).stream()
                .map(r -> new TradeRecord(
                        r.str("pos").replace(SparqlValues.ENTITY_NS.replace("entity", "position"), ""),
                        new EntityRef(r.id("holder"), r.str("holderName"), List.of()),
                        new EntityRef(r.id("issuer"), r.str("issuerName"), List.of()),
                        new Instrument(r.str("cusip"), r.str("ticker"), r.str("class")),
                        r.decimal("quantity"),
                        r.decimal("value"),
                        r.date("asOf"),
                        r.str("accession"),
                        r.str("form")))
                .toList();
    }
}
