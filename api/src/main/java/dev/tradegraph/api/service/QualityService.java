package dev.tradegraph.api.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.tradegraph.api.config.TradeGraphProperties;
import dev.tradegraph.api.model.QualityReport;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.stereotype.Service;

/**
 * Serves the quality report of the last load. The checks belong to the ETL, which is where
 * the source records still exist, so the API only reads the JSON document it left behind.
 */
@Service
public class QualityService {

    private final Path reportPath;
    private final ObjectMapper mapper;

    public QualityService(TradeGraphProperties properties, ObjectMapper mapper) {
        this.reportPath = Path.of(properties.quality().reportPath());
        this.mapper = mapper;
    }

    public QualityReport report() {
        if (!Files.isReadable(reportPath)) {
            throw new NotFoundException(
                    "no quality report at " + reportPath.toAbsolutePath() + "; run tradegraph-etl validate");
        }
        try {
            return mapper.readValue(reportPath.toFile(), QualityReport.class);
        } catch (IOException e) {
            throw new UncheckedIOException("quality report at " + reportPath + " could not be read", e);
        }
    }
}
