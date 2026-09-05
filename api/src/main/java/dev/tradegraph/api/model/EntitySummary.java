package dev.tradegraph.api.model;

import java.util.List;

public record EntitySummary(String id, String name, String ticker, String cik, List<String> kinds) {
}
