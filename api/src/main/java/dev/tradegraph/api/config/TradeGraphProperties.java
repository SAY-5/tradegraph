package dev.tradegraph.api.config;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Typed view of the {@code tradegraph.*} configuration block. */
@ConfigurationProperties(prefix = "tradegraph")
public record TradeGraphProperties(Store store, Lineage lineage, Exposure exposure, Search search,
        Quality quality, Cors cors) {

    public record Store(
            @DefaultValue("fuseki") String kind,
            String queryUrl,
            String username,
            String password,
            @DefaultValue("false") boolean reasoning,
            @DefaultValue("5s") Duration connectTimeout,
            @DefaultValue("60s") Duration readTimeout) {

        public boolean isStardog() {
            return "stardog".equalsIgnoreCase(kind);
        }

        public boolean hasCredentials() {
            return username != null && !username.isBlank();
        }
    }

    public record Lineage(@DefaultValue("5") int maxDepth) {
    }

    public record Exposure(@DefaultValue("4") int maxDepth, @DefaultValue("0.01") BigDecimal minShare) {
    }

    public record Search(@DefaultValue("20") int defaultLimit, @DefaultValue("100") int maxLimit) {
    }

    public record Quality(@DefaultValue("../etl/build/quality.json") String reportPath) {
    }

    public record Cors(@DefaultValue("http://localhost:4200") List<String> allowedOrigins) {
    }
}
