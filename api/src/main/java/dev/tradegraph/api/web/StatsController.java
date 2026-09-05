package dev.tradegraph.api.web;

import dev.tradegraph.api.model.Stats;
import dev.tradegraph.api.service.StatsService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class StatsController {

    private final StatsService stats;

    public StatsController(StatsService stats) {
        this.stats = stats;
    }

    @GetMapping("/stats")
    public Stats stats() {
        return stats.stats();
    }
}
