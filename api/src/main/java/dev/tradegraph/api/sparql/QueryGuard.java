package dev.tradegraph.api.sparql;

import java.util.regex.Pattern;

/**
 * Cost guard. Two things make a query on this graph unbounded in practice: a property path
 * with {@code *} or {@code +}, which walks the whole lineage closure, and a depth larger
 * than the store is configured for, which expands into an alternation the store then has to
 * evaluate branch by branch.
 *
 * <p>The two are checked in different places because only one of them depends on the
 * request. A property path can only come from a template or from {@link SparqlPaths}, so
 * {@link QueryTemplates} checks every template as it loads it and a failure is a defect in
 * the repository, caught at startup. Depth comes from the request, so {@link #depth} is
 * checked per request and answers 422. Scanning a rendered query instead would read the
 * quoted literals a caller supplied: a search for {@code tg:x+} contains the pattern and is
 * a perfectly ordinary search term.
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

    /** Rejects SPARQL that walks an unbounded property path. */
    public static void rejectUnboundedPaths(String query) {
        rejectUnboundedPaths("query", query);
    }

    /** The same check, naming what carried the path so a template defect points at itself. */
    public static void rejectUnboundedPaths(String what, String sparql) {
        if (UNBOUNDED_PATH.matcher(sparql).find()) {
            throw new QueryCostException(what + " walks an unbounded property path");
        }
    }
}
