package dev.tradegraph.api.model;

import java.util.List;

public record EntityRef(String id, String name, List<String> kinds) {
}
