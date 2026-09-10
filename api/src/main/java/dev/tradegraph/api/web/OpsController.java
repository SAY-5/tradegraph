package dev.tradegraph.api.web;

import dev.tradegraph.api.model.OpsOverview;
import dev.tradegraph.api.service.OpsService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OpsController {

    private final OpsService ops;

    public OpsController(OpsService ops) {
        this.ops = ops;
    }

    @GetMapping("/ops/overview")
    public OpsOverview overview() {
        return ops.overview();
    }
}
