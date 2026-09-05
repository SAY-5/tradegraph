package dev.tradegraph.api.model;

import java.math.BigDecimal;
import java.util.List;

public record NeighborGraph(String center, List<Node> nodes, List<Link> links) {

    public record Node(String id, String name, List<String> kinds) {
    }

    public record Link(String source, String target, String rel, BigDecimal weight) {
    }
}
