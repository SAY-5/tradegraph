package dev.tradegraph.api.sparql;

import java.util.regex.Pattern;

/**
 * Cost guard. Two things make a query on this graph unbounded in practice: a property path
 * with {@code *} or {@code +}, which walks the whole lineage closure, and a depth larger
 * than the store is configured for, which expands into an alternation the store then has to
 * evaluate branch by branch. The API never renders either, so a guard failure is a defect in
 * a template or a request that asked for more than the configuration allows.
 */
public final class QueryGuard {

    private static final Pattern UNBOUNDED_PATH =
            Pattern.compile("(?:[A-Za-z_][\\w.\\-]*:[\\w.\\-]+|>|\\))\\s*[*+]");

    private QueryGuard() {
    }

    /** The requested depth, or a failure when it is above {@code max}. Below 1 is raised to 1. */
    public static int depth(Integer requested, int max, String what) {
        if (requested == null) {
            return max;
        }
        if (requested > max) {
            throw new QueryCostException(
                    what + " depth " + requested + " is above the configured maximum of " + max);
        }
        return Math.max(requested, 1);
    }

    /** Rejects a rendered query that walks an unbounded property path. */
    public static void rejectUnboundedPaths(String query) {
        if (UNBOUNDED_PATH.matcher(query).find()) {
            throw new QueryCostException("query walks an unbounded property path");
        }
    }
}
