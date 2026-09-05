package dev.tradegraph.api.config;

import dev.tradegraph.api.sparql.QueryTemplates;
import dev.tradegraph.api.sparql.SparqlClient;
import java.net.http.HttpClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
public class SparqlClientConfig {

    @Bean
    public SparqlClient sparqlClient(TradeGraphProperties properties) {
        TradeGraphProperties.Store store = properties.store();
        HttpClient http = HttpClient.newBuilder().connectTimeout(store.connectTimeout()).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(store.readTimeout());
        RestClient.Builder builder = RestClient.builder().baseUrl(store.queryUrl()).requestFactory(factory);
        if (store.hasCredentials()) {
            builder.defaultHeaders(h -> h.setBasicAuth(store.username(), store.password()));
        }
        return new SparqlClient(builder.build(), store.isStardog() && store.reasoning());
    }

    @Bean
    public QueryTemplates queryTemplates() {
        return QueryTemplates.fromClasspath();
    }
}
