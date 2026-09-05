package dev.tradegraph.api.sparql;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** A solution row: variable name to term. */
public record Row(Map<String, RdfTerm> bindings) {

    public Optional<RdfTerm> get(String var) {
        return Optional.ofNullable(bindings.get(var));
    }

    public String str(String var) {
        return get(var).map(RdfTerm::value).orElse(null);
    }

    public String id(String var) {
        return get(var).map(RdfTerm::localName).orElse(null);
    }

    public BigDecimal decimal(String var) {
        return get(var).map(RdfTerm::asDecimal).orElse(BigDecimal.ZERO);
    }

    public long asLong(String var) {
        return get(var).map(RdfTerm::asLong).orElse(0L);
    }

    public LocalDate date(String var) {
        return get(var).map(RdfTerm::asDate).orElse(null);
    }

    /** Splits a GROUP_CONCAT of class IRIs into local names, e.g. {@code Fund,Issuer}. */
    public List<String> kinds(String var) {
        String raw = str(var);
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .map(v -> v.substring(Math.max(v.lastIndexOf('#'), v.lastIndexOf('/')) + 1))
                .sorted()
                .toList();
    }
}
