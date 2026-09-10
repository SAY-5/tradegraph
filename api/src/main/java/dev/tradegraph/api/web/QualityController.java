package dev.tradegraph.api.web;

import dev.tradegraph.api.model.QualityReport;
import dev.tradegraph.api.service.QualityService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class QualityController {

    private final QualityService quality;

    public QualityController(QualityService quality) {
        this.quality = quality;
    }

    @GetMapping("/quality")
    public QualityReport quality() {
        return quality.report();
    }
}
