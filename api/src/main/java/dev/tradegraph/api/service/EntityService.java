package dev.tradegraph.api.service;

import dev.tradegraph.api.config.TradeGraphProperties;
import dev.tradegraph.api.model.EntityDetail;
import dev.tradegraph.api.model.EntityRef;
import dev.tradegraph.api.model.EntitySummary;
import dev.tradegraph.api.sparql.QueryTemplates;
import dev.tradegraph.api.sparql.Row;
import dev.tradegraph.api.sparql.SparqlClient;
import dev.tradegraph.api.sparql.SparqlValues;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

@Service
public class EntityService {

    private final SparqlClient sparql;
    private final QueryTemplates templates;
    private final TradeGraphProperties properties;

    public EntityService(SparqlClient sparql, QueryTemplates templates, TradeGraphProperties properties) {
        this.sparql = sparql;
        this.templates = templates;
        this.properties = properties;
    }

    @Cacheable("search")
    public List<EntitySummary> search(String q, Integer limit) {
        String query = q == null ? "" : q.trim();
        if (query.length() < 2) {
            throw new IllegalArgumentException("q must be at least 2 characters");
        }
        int max = properties.search().maxLimit();
        int effective = limit == null ? properties.search().defaultLimit() : Math.min(Math.max(limit, 1), max);
        String rendered = templates.render("search", Map.of(
                "q", SparqlValues.literal(query),
                "qLower", SparqlValues.literal(query.toLowerCase(Locale.ROOT)),
                "limit", SparqlValues.integer(effective)));
        return sparql.select(rendered).stream()
                .map(r -> new EntitySummary(r.id("e"), r.str("name"), r.str("ticker"), r.str("cik"), r.kinds("types")))
                .toList();
    }

    @Cacheable("entity")
    public EntityDetail get(String id) {
        String iri = SparqlValues.entityIri(id);
        List<Row> rows = sparql.select(templates.render("entity", Map.of("iri", iri)));
        if (rows.isEmpty()) {
            throw new NotFoundException("entity not found: " + id);
        }
        Row r = rows.get(0);
        Row counts = sparql.select(templates.render("entity_counts", Map.of("iri", iri))).get(0);
        EntityRef parent = r.str("parent") == null
                ? null
                : new EntityRef(r.id("parent"), r.str("parentName"), List.of());
        return new EntityDetail(
                id,
                r.str("name"),
                r.kinds("types"),
                r.str("ticker"),
                r.str("cik"),
                r.str("lei"),
                r.str("jurisdiction"),
                parent,
                counts.asLong("subsidiaries"),
                counts.asLong("positionsHeld"),
                counts.decimal("valueHeld"),
                counts.asLong("positionsIssued"),
                counts.decimal("valueIssued"));
    }

    public EntityRef ref(String id) {
        EntityDetail d = get(id);
        return new EntityRef(d.id(), d.name(), d.kinds());
    }
}
