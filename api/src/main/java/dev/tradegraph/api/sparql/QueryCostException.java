package dev.tradegraph.api.sparql;

/** A request the store should not be asked to answer: an unbounded path or too deep a walk. */
public class QueryCostException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public QueryCostException(String message) {
        super(message);
    }
}
