package dev.tradegraph.api.sparql;

import java.time.LocalDate;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Builds SPARQL terms from untrusted input. Every value that reaches a query template
 * passes through one of these methods, which is what keeps the templates injection safe:
 * identifiers are validated against a strict pattern and strings are escaped per the
 * SPARQL grammar rather than concatenated.
 */
public final class SparqlValues {

    public static final String ENTITY_NS = "https://tradegraph.dev/entity/";
    private static final Pattern ID = Pattern.compile("[A-Za-z0-9_-]{1,64}");

    private SparqlValues() {
    }

    public static boolean isValidId(String id) {
        return id != null && ID.matcher(id).matches();
    }

    /** Entity IRI for a validated identifier, e.g. {@code <https://tradegraph.dev/entity/0000320193>}. */
    public static String entityIri(String id) {
        if (!isValidId(id)) {
            throw new IllegalArgumentException("invalid entity id: " + id);
        }
        return "<" + ENTITY_NS + id + ">";
    }

    /** A quoted, escaped string literal. */
    public static String literal(String value) {
        StringBuilder sb = new StringBuilder(value.length() + 2).append('"');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '\\' -> sb.append("\\\\");
                case '"' -> sb.append("\\\"");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                case '\b' -> sb.append("\\b");
                case '\f' -> sb.append("\\f");
                default -> sb.append(c);
            }
        }
        return sb.append('"').toString();
    }

    public static String integer(long value) {
        return Long.toString(value);
    }

    /** An {@code xsd:date} literal, e.g. {@code "2024-06-30"^^xsd:date}. */
    public static String date(LocalDate value) {
        return "\"" + value + "\"^^xsd:date";
    }

    /**
     * An inline data block. An empty term list produces {@code VALUES ?d { }}, which is legal
     * SPARQL 1.1 and yields no solutions, so a period that matches nothing needs no special case.
     */
    public static String values(String variable, List<String> terms) {
        return "VALUES ?" + variable + " { " + String.join(" ", terms) + " }";
    }
}
