package dev.tradegraph.api.model;

public record Stats(
        String store,
        long entities,
        long issuers,
        long funds,
        long subsidiaries,
        long positions,
        long filings,
        long lineageEdges,
        long triples,
        long queryMillis) {
}
