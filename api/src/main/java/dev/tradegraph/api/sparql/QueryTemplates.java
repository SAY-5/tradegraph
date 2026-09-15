package dev.tradegraph.api.sparql;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

/**
 * Loads {@code queries/*.rq} from the classpath and renders {@code ${name}} placeholders.
 * Values are inserted verbatim, so callers must build them with {@link SparqlValues} or
 * {@link SparqlPaths}; rendering fails if a placeholder is left unresolved.
 *
 * <p>Every template is checked for an unbounded property path as it is loaded, which is the
 * one place that invariant can be established for the whole API: a template is the only
 * thing that could carry one, and it cannot change between requests.
 */
public final class QueryTemplates {

    private static final Pattern PLACEHOLDER = Pattern.compile("\\$\\{([a-zA-Z]+)}");

    private final Map<String, String> templates;
    private final String prefixes;

    QueryTemplates(Map<String, String> templates) {
        this.templates = Map.copyOf(templates);
        this.prefixes = this.templates.getOrDefault("prefixes", "");
        this.templates.forEach((name, text) -> QueryGuard.rejectUnboundedPaths(name + ".rq", text));
    }

    public static QueryTemplates fromClasspath() {
        Map<String, String> loaded = new HashMap<>();
        try {
            Resource[] resources = new PathMatchingResourcePatternResolver().getResources("classpath:queries/*.rq");
            for (Resource r : resources) {
                String name = r.getFilename().replaceFirst("\\.rq$", "");
                loaded.put(name, r.getContentAsString(StandardCharsets.UTF_8));
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return new QueryTemplates(loaded);
    }

    public String render(String name, Map<String, String> params) {
        String template = templates.get(name);
        if (template == null) {
            throw new IllegalArgumentException("unknown query template: " + name);
        }
        Matcher m = PLACEHOLDER.matcher(template);
        StringBuilder sb = new StringBuilder(prefixes).append('\n');
        while (m.find()) {
            String value = params.get(m.group(1));
            if (value == null) {
                throw new IllegalArgumentException("unresolved placeholder ${" + m.group(1) + "} in " + name);
            }
            m.appendReplacement(sb, Matcher.quoteReplacement(value));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    public boolean has(String name) {
        return templates.containsKey(name);
    }
}
