package dev.tradegraph.api.sparql;

import java.math.BigDecimal;
import java.time.LocalDate;

/** One binding from a SPARQL JSON result set. */
public record RdfTerm(String type, String value, String datatype, String lang) {

    public boolean isIri() {
        return "uri".equals(type);
    }

    public BigDecimal asDecimal() {
        return new BigDecimal(value);
    }

    public long asLong() {
        return new BigDecimal(value).longValueExact();
    }

    public LocalDate asDate() {
        return LocalDate.parse(value.length() > 10 ? value.substring(0, 10) : value);
    }

    /** Local part of an IRI: the last path segment. */
    public String localName() {
        int hash = value.lastIndexOf('#');
        int slash = value.lastIndexOf('/');
        return value.substring(Math.max(hash, slash) + 1);
    }
}
