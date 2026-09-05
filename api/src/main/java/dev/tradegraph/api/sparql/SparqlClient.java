package dev.tradegraph.api.sparql;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * SPARQL 1.1 Protocol client. Queries are sent as {@code application/x-www-form-urlencoded}
 * POST requests, which every conformant store (Stardog, Fuseki, GraphDB, ...) accepts and
 * which avoids URL length limits for large VALUES blocks.
 */
public class SparqlClient {

    private static final Logger LOG = LoggerFactory.getLogger(SparqlClient.class);
    private static final String RESULTS_JSON = "application/sparql-results+json";

    private final RestClient client;
    private final boolean reasoning;

    public SparqlClient(RestClient client, boolean reasoning) {
        this.client = client;
        this.reasoning = reasoning;
    }

    public List<Row> select(String query) {
        JsonNode json = execute(query);
        List<Row> rows = new ArrayList<>();
        for (JsonNode binding : json.path("results").path("bindings")) {
            Map<String, RdfTerm> terms = new LinkedHashMap<>();
            binding.fields().forEachRemaining(e -> terms.put(e.getKey(), term(e.getValue())));
            rows.add(new Row(terms));
        }
        return rows;
    }

    public boolean ask(String query) {
        return execute(query).path("boolean").asBoolean(false);
    }

    private JsonNode execute(String query) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("query", query);
        if (reasoning) {
            form.add("reasoning", "true");
        }
        long started = System.nanoTime();
        try {
            JsonNode body = client.post()
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .accept(MediaType.parseMediaType(RESULTS_JSON))
                    .body(form)
                    .retrieve()
                    .body(JsonNode.class);
            if (LOG.isDebugEnabled()) {
                LOG.debug("sparql {} ms\n{}", (System.nanoTime() - started) / 1_000_000, query);
            }
            if (body == null) {
                throw new SparqlException("empty response from store", null);
            }
            return body;
        } catch (RestClientException e) {
            throw new SparqlException("store request failed: " + e.getMessage(), e);
        }
    }

    private static RdfTerm term(JsonNode node) {
        return new RdfTerm(
                node.path("type").asText(),
                node.path("value").asText(),
                node.hasNonNull("datatype") ? node.get("datatype").asText() : null,
                node.hasNonNull("xml:lang") ? node.get("xml:lang").asText() : null);
    }
}
