package dev.tradegraph.api.service;

import dev.tradegraph.api.config.TradeGraphProperties;
import dev.tradegraph.api.model.Stats;
import dev.tradegraph.api.sparql.QueryTemplates;
import dev.tradegraph.api.sparql.Row;
import dev.tradegraph.api.sparql.SparqlClient;
import java.util.Map;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

@Service
public class StatsService {

    private final SparqlClient sparql;
    private final QueryTemplates templates;
    private final TradeGraphProperties properties;

    public StatsService(SparqlClient sparql, QueryTemplates templates, TradeGraphProperties properties) {
        this.sparql = sparql;
        this.templates = templates;
        this.properties = properties;
    }

    @Cacheable("stats")
    public Stats stats() {
        long started = System.nanoTime();
        Row r = sparql.select("stats", templates.render("stats", Map.of())).get(0);
        return new Stats(properties.store().kind(), r.asLong("entities"), r.asLong("issuers"), r.asLong("funds"),
                r.asLong("subsidiaries"), r.asLong("positions"), r.asLong("filings"), r.asLong("lineageEdges"),
                r.asLong("triples"), (System.nanoTime() - started) / 1_000_000);
    }
}
