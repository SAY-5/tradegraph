package dev.tradegraph.api.service;

import dev.tradegraph.api.model.EntityRef;
import dev.tradegraph.api.model.Instrument;
import dev.tradegraph.api.model.TradeRecord;
import dev.tradegraph.api.sparql.QueryTemplates;
import dev.tradegraph.api.sparql.SparqlClient;
import dev.tradegraph.api.sparql.SparqlValues;
import java.util.List;
import java.util.Map;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

@Service
public class TradeService {

    private final SparqlClient sparql;
    private final QueryTemplates templates;

    public TradeService(SparqlClient sparql, QueryTemplates templates) {
        this.sparql = sparql;
        this.templates = templates;
    }

    @Cacheable("trades")
    public List<TradeRecord> forEntity(String id, int limit, int offset) {
        String query = templates.render("trades", Map.of(
                "iri", SparqlValues.entityIri(id),
                "limit", SparqlValues.integer(Math.min(Math.max(limit, 1), 500)),
                "offset", SparqlValues.integer(Math.max(offset, 0))));
        return sparql.select(query).stream()
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
