package dev.tradegraph.api.sparql;

/**
 * Depth limited property paths. SPARQL 1.1 dropped bounded repetition ({@code p{1,3}}),
 * and store specific extensions differ, so a bounded path is expanded into an alternative
 * of fixed length sequences that any store evaluates the same way.
 */
public final class SparqlPaths {

    public static final String SUBSIDIARY_OF = "tg:subsidiaryOf";

    private SparqlPaths() {
    }

    /**
     * The same walk when the store already materialises the transitive closure, either
     * Stardog with {@code reasoning=true} or the Fuseki inference dataset: one hop reaches
     * everything the bounded alternation would.
     */
    public static String bounded(String property, int min, int max, boolean closureMaterialised) {
        if (closureMaterialised && min <= 1) {
            return max < min ? "" : property;
        }
        return bounded(property, min, max);
    }

    /** {@code UNION { subject path object }} against a store that materialises the closure. */
    public static String unionHops(String subject, String object, int minHops, int maxHops,
            boolean closureMaterialised) {
        String path = bounded(SUBSIDIARY_OF, minHops, maxHops, closureMaterialised);
        if (path.isEmpty()) {
            return "";
        }
        return "UNION { " + subject + " " + path + " " + object + " }";
    }

    /** {@code (p|p/p|p/p/p)} for min=1, max=3. Returns an empty string when max < min. */
    public static String bounded(String property, int min, int max) {
        if (min < 1) {
            throw new IllegalArgumentException("min must be at least 1");
        }
        if (max < min) {
            return "";
        }
        StringBuilder sb = new StringBuilder("(");
        for (int len = min; len <= max; len++) {
            if (len > min) {
                sb.append('|');
            }
            for (int i = 0; i < len; i++) {
                if (i > 0) {
                    sb.append('/');
                }
                sb.append(property);
            }
        }
        return sb.append(')').toString();
    }

    /** {@code UNION { subject path object }} with a bounded path, or empty when depth allows no extra hops. */
    public static String unionHops(String subject, String object, int minHops, int maxHops) {
        String path = bounded(SUBSIDIARY_OF, minHops, maxHops);
        if (path.isEmpty()) {
            return "";
        }
        return "UNION { " + subject + " " + path + " " + object + " }";
    }
}
