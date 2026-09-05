package dev.tradegraph.api.health;

import dev.tradegraph.api.config.TradeGraphProperties;
import dev.tradegraph.api.sparql.QueryTemplates;
import dev.tradegraph.api.sparql.SparqlClient;
import java.util.Map;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

/** Reports the SPARQL store as a health component by running {@code ASK {}} against it. */
@Component("store")
public class StoreHealthIndicator implements HealthIndicator {

    private final SparqlClient sparql;
    private final QueryTemplates templates;
    private final TradeGraphProperties properties;

    public StoreHealthIndicator(SparqlClient sparql, QueryTemplates templates, TradeGraphProperties properties) {
        this.sparql = sparql;
        this.templates = templates;
        this.properties = properties;
    }

    @Override
    public Health health() {
        long started = System.nanoTime();
        try {
            boolean ok = sparql.ask(templates.render("ping", Map.of()));
            Health.Builder b = ok ? Health.up() : Health.down();
            return b.withDetail("kind", properties.store().kind())
                    .withDetail("queryUrl", properties.store().queryUrl())
                    .withDetail("latencyMillis", (System.nanoTime() - started) / 1_000_000)
                    .build();
        } catch (RuntimeException e) {
            return Health.down(e).withDetail("queryUrl", properties.store().queryUrl()).build();
        }
    }
}
