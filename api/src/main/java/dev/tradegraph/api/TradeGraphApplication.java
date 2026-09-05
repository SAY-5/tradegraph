package dev.tradegraph.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.cache.annotation.EnableCaching;

@SpringBootApplication
@EnableCaching
@ConfigurationPropertiesScan
public class TradeGraphApplication {

    public static void main(String[] args) {
        SpringApplication.run(TradeGraphApplication.class, args);
    }
}
