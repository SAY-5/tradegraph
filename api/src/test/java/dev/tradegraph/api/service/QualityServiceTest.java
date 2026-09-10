package dev.tradegraph.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import dev.tradegraph.api.config.TradeGraphProperties;
import dev.tradegraph.api.model.QualityReport;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class QualityServiceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper().registerModule(new JavaTimeModule());

    private static QualityService service(String path) {
        TradeGraphProperties properties = new TradeGraphProperties(null, null, null, null,
                new TradeGraphProperties.Quality(path), null, null);
        return new QualityService(properties, MAPPER);
    }

    @Test
    void readsTheReportTheEtlLeftBehind() {
        QualityReport report = service("src/test/resources/quality.json").report();
        assertThat(report.conforms()).isFalse();
        assertThat(report.checkedAt()).isEqualTo(Instant.parse("2026-09-10T09:39:54Z"));
        assertThat(report.danglingReferences()).isEqualTo(1);
        assertThat(report.subsidiaryCycles()).isEqualTo(1);
        assertThat(report.findings()).hasSize(4);
    }

    @Test
    void aMissingReportIsNotFound() {
        assertThatThrownBy(() -> service("src/test/resources/no-such-report.json").report())
                .isInstanceOf(NotFoundException.class)
                .hasMessageContaining("tradegraph-etl validate");
    }
}
