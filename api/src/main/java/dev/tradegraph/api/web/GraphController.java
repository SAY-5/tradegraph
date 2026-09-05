package dev.tradegraph.api.web;

import dev.tradegraph.api.model.NeighborGraph;
import dev.tradegraph.api.service.GraphService;
import jakarta.validation.constraints.Pattern;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
public class GraphController {

    private final GraphService graph;

    public GraphController(GraphService graph) {
        this.graph = graph;
    }

    @GetMapping("/graph/neighbors/{id}")
    public NeighborGraph neighbors(@PathVariable("id") @Pattern(regexp = EntityController.ID_PATTERN) String id,
            @RequestParam(value = "limit", defaultValue = "40") int limit) {
        return graph.neighbors(id, limit);
    }
}
