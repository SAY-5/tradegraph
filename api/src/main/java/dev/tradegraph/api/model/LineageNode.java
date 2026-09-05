package dev.tradegraph.api.model;

import java.util.ArrayList;
import java.util.List;

public record LineageNode(String id, String name, List<String> kinds, String jurisdiction, int depth,
        List<LineageNode> children) {

    public static LineageNode of(String id, String name, List<String> kinds, String jurisdiction, int depth) {
        return new LineageNode(id, name, kinds, jurisdiction, depth, new ArrayList<>());
    }

    public int size() {
        int n = 1;
        for (LineageNode c : children) {
            n += c.size();
        }
        return n;
    }

    public int maxDepth() {
        int d = depth;
        for (LineageNode c : children) {
            d = Math.max(d, c.maxDepth());
        }
        return d;
    }
}
