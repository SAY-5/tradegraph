package dev.tradegraph.api.service;

import dev.tradegraph.api.model.EntityRef;
import dev.tradegraph.api.model.NeighborGraph;
import dev.tradegraph.api.sparql.QueryTemplates;
import dev.tradegraph.api.sparql.Row;
import dev.tradegraph.api.sparql.SparqlClient;
import dev.tradegraph.api.sparql.SparqlValues;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

@Service
public class GraphService {

    private final SparqlClient sparql;
    private final QueryTemplates templates;
    private final EntityService entities;

    public GraphService(SparqlClient sparql, QueryTemplates templates, EntityService entities) {
        this.sparql = sparql;
        this.templates = templates;
        this.entities = entities;
    }

    @Cacheable("neighbors")
    public NeighborGraph neighbors(String id, int limit) {
        EntityRef center = entities.ref(id);
        String query = templates.render("neighbors", Map.of(
                "iri", SparqlValues.entityIri(id),
                "limit", SparqlValues.integer(Math.min(Math.max(limit, 1), 200))));
        Map<String, NeighborGraph.Node> nodes = new LinkedHashMap<>();
        nodes.put(center.id(), new NeighborGraph.Node(center.id(), center.name(), center.kinds()));
        List<NeighborGraph.Link> links = new ArrayList<>();
        for (Row r : sparql.select("neighbors", query)) {
            String other = r.id("other");
            nodes.putIfAbsent(other, new NeighborGraph.Node(other, r.str("otherName"), r.kinds("otherTypes")));
            String rel = r.str("rel");
            boolean outgoing = "PARENT".equals(rel) || "HOLDS".equals(rel);
            String relation = switch (rel) {
                case "PARENT", "SUBSIDIARY" -> "subsidiaryOf";
                default -> "holds";
            };
            links.add(new NeighborGraph.Link(outgoing ? center.id() : other, outgoing ? other : center.id(),
                    relation, r.decimal("weight")));
        }
        return new NeighborGraph(center.id(), new ArrayList<>(nodes.values()), links);
    }
}
