package dev.tradegraph.api.model;

import java.util.List;

/**
 * Lineage of an entity: {@code ancestors} nearest first up to the ultimate parent,
 * {@code descendants} as a tree rooted at the entity, both depth limited.
 */
public record LineageResponse(
        EntityRef entity,
        List<EntityRef> ancestors,
        EntityRef ultimateParent,
        LineageNode descendants,
        int maxDepth,
        int descendantCount,
        int deepestLevel,
        long queryMillis) {
}
