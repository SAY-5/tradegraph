package dev.tradegraph.api.service;

import dev.tradegraph.api.model.PathStep;
import dev.tradegraph.api.sparql.QueryTemplates;
import dev.tradegraph.api.sparql.Row;
import dev.tradegraph.api.sparql.SparqlClient;
import dev.tradegraph.api.sparql.SparqlValues;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Ownership fractions along a lineage path. An Exhibit 21 line states how much of a
 * subsidiary its parent owns, so the share of a position attributable to the far end of a
 * path is the product of the fractions on every lineage hop the path crosses.
 */
@Service
public class OwnershipService {

    private final SparqlClient sparql;
    private final QueryTemplates templates;

    public OwnershipService(SparqlClient sparql, QueryTemplates templates) {
        this.sparql = sparql;
        this.templates = templates;
    }

    /** Fraction of each entity owned by its parent. Entities without a parent are left out. */
    public Map<String, BigDecimal> fractions(Collection<String> ids) {
        if (ids.isEmpty()) {
            return Map.of();
        }
        String query = templates.render("ownership", Map.of(
                "entityValues", SparqlValues.values("entity", ids.stream().map(SparqlValues::entityIri).toList())));
        Map<String, BigDecimal> fractions = new HashMap<>();
        for (Row r : sparql.select("ownership", query)) {
            fractions.put(r.id("entity"), r.decimal("fraction"));
        }
        return fractions;
    }

    /** Product of the fractions on the lineage hops of a path; a hop with no stated fraction counts as whole. */
    static BigDecimal weight(List<PathStep> path, Map<String, BigDecimal> fractions) {
        BigDecimal weight = BigDecimal.ONE;
        for (String owned : ownedOn(path)) {
            weight = weight.multiply(fractions.getOrDefault(owned, BigDecimal.ONE));
        }
        return weight;
    }

    /**
     * Entity ids whose ownership fraction a path needs: a {@code parent} step is reached by
     * owning the step before it, a {@code subsidiary} step by owning that step itself.
     */
    static List<String> ownedOn(List<PathStep> path) {
        List<String> owned = new ArrayList<>();
        for (int i = 1; i < path.size(); i++) {
            switch (path.get(i).hop()) {
                case PathStep.PARENT -> owned.add(path.get(i - 1).id());
                case PathStep.SUBSIDIARY -> owned.add(path.get(i).id());
                default -> { }
            }
        }
        return owned;
    }
}
