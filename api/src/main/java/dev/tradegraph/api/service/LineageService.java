package dev.tradegraph.api.service;

import dev.tradegraph.api.config.TradeGraphProperties;
import dev.tradegraph.api.model.EntityRef;
import dev.tradegraph.api.model.LineageNode;
import dev.tradegraph.api.model.LineageResponse;
import dev.tradegraph.api.sparql.QueryGuard;
import dev.tradegraph.api.sparql.QueryTemplates;
import dev.tradegraph.api.sparql.Row;
import dev.tradegraph.api.sparql.SparqlClient;
import dev.tradegraph.api.sparql.SparqlPaths;
import dev.tradegraph.api.sparql.SparqlValues;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

/**
 * Lineage walks. The store returns the set of parent/child edges reachable within the depth
 * budget (one query per direction); ordering into a chain or a tree happens here, because
 * SPARQL cannot report the position of a node on a path.
 */
@Service
public class LineageService {

    private final SparqlClient sparql;
    private final QueryTemplates templates;
    private final EntityService entities;
    private final TradeGraphProperties properties;

    public LineageService(SparqlClient sparql, QueryTemplates templates, EntityService entities,
            TradeGraphProperties properties) {
        this.sparql = sparql;
        this.templates = templates;
        this.entities = entities;
        this.properties = properties;
    }

    public int clampDepth(Integer requested) {
        return QueryGuard.depth(requested, properties.lineage().maxDepth(), "lineage");
    }

    /**
     * A store that materialises the closure reports every ancestor as a direct parent, which
     * would break the chain walk, so the edge queries ask for direct edges only.
     */
    private String directOnly(String child, String parent) {
        return properties.store().reasoning()
                ? "FILTER NOT EXISTS { " + child + " tg:subsidiaryOf ?between . ?between tg:subsidiaryOf "
                        + parent + " }"
                : "";
    }

    /** Ancestors nearest first, at most {@code depth} of them. */
    @Cacheable("ancestors")
    public List<EntityRef> ancestors(String id, int depth) {
        String iri = SparqlValues.entityIri(id);
        String query = templates.render("lineage_up", Map.of(
                "iri", iri,
                "depth", SparqlValues.integer(depth),
                "directOnly", directOnly("?child", "?parent"),
                "moreChildren", SparqlPaths.unionHops(iri, "?child", 1, depth - 1)));
        Map<String, EntityRef> parentOf = new HashMap<>();
        for (Row r : sparql.select("lineage_up", query)) {
            parentOf.put(r.id("child"), new EntityRef(r.id("parent"), r.str("parentName"), r.kinds("parentTypes")));
        }
        List<EntityRef> chain = new ArrayList<>();
        String cursor = id;
        while (chain.size() < depth && parentOf.containsKey(cursor)) {
            EntityRef parent = parentOf.get(cursor);
            chain.add(parent);
            cursor = parent.id();
        }
        return chain;
    }

    @Cacheable("lineage")
    public LineageResponse lineage(String id, int depth) {
        long started = System.nanoTime();
        EntityRef self = entities.ref(id);
        List<EntityRef> ancestors = ancestors(id, depth);
        LineageNode root = descendants(self, depth);
        EntityRef ultimate = ancestors.isEmpty() ? self : ancestors.get(ancestors.size() - 1);
        return new LineageResponse(self, ancestors, ultimate, root, depth, root.size() - 1, root.maxDepth(),
                (System.nanoTime() - started) / 1_000_000);
    }

    LineageNode descendants(EntityRef self, int depth) {
        String iri = SparqlValues.entityIri(self.id());
        String query = templates.render("lineage_down", Map.of(
                "iri", iri,
                "depth", SparqlValues.integer(depth),
                "directOnly", directOnly("?child", "?parent"),
                "moreParents", SparqlPaths.unionHops("?parent", iri, 1, depth - 1)));
        Map<String, List<Row>> childrenOf = new HashMap<>();
        for (Row r : sparql.select("lineage_down", query)) {
            childrenOf.computeIfAbsent(r.id("parent"), k -> new ArrayList<>()).add(r);
        }
        LineageNode root = LineageNode.of(self.id(), self.name(), self.kinds(), null, 0);
        attach(root, childrenOf, depth);
        return root;
    }

    private void attach(LineageNode node, Map<String, List<Row>> childrenOf, int depth) {
        if (node.depth() >= depth) {
            return;
        }
        for (Row r : childrenOf.getOrDefault(node.id(), List.of())) {
            LineageNode child = LineageNode.of(r.id("child"), r.str("childName"), r.kinds("childTypes"),
                    r.str("jurisdiction"), node.depth() + 1);
            node.children().add(child);
            attach(child, childrenOf, depth);
        }
    }
}
