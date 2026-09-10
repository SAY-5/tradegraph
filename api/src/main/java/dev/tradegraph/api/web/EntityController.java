package dev.tradegraph.api.web;

import dev.tradegraph.api.model.EntityDetail;
import dev.tradegraph.api.model.EntitySummary;
import dev.tradegraph.api.model.ExposureResponse;
import dev.tradegraph.api.model.LineageResponse;
import dev.tradegraph.api.service.EntityService;
import dev.tradegraph.api.service.ExposureService;
import dev.tradegraph.api.service.LineageService;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/entities")
@Validated
public class EntityController {

    static final String ID_PATTERN = "[A-Za-z0-9_-]{1,64}";

    private final EntityService entities;
    private final LineageService lineage;
    private final ExposureService exposure;

    public EntityController(EntityService entities, LineageService lineage, ExposureService exposure) {
        this.entities = entities;
        this.lineage = lineage;
        this.exposure = exposure;
    }

    @GetMapping
    public List<EntitySummary> search(@RequestParam("q") String q,
            @RequestParam(value = "limit", required = false) Integer limit) {
        return entities.search(q, limit);
    }

    @GetMapping("/{id}")
    public EntityDetail get(@PathVariable("id") @Pattern(regexp = ID_PATTERN) String id) {
        return entities.get(id);
    }

    @GetMapping("/{id}/lineage")
    public LineageResponse lineage(@PathVariable("id") @Pattern(regexp = ID_PATTERN) String id,
            @RequestParam(value = "depth", required = false) Integer depth) {
        return lineage.lineage(id, lineage.clampDepth(depth));
    }

    @GetMapping("/{id}/exposure")
    public ExposureResponse exposure(@PathVariable("id") @Pattern(regexp = ID_PATTERN) String id,
            @RequestParam("issuer") @Pattern(regexp = ID_PATTERN) String issuer,
            @RequestParam(value = "includeAffiliates", defaultValue = "true") boolean includeAffiliates,
            @RequestParam(value = "includeSubsidiaries", defaultValue = "true") boolean includeSubsidiaries,
            @RequestParam(value = "weighted", defaultValue = "false") boolean weighted,
            @RequestParam(value = "depth", required = false) Integer depth,
            @RequestParam(value = "as_of", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf) {
        return exposure.exposure(id, issuer, includeAffiliates, includeSubsidiaries, weighted,
                exposure.clampDepth(depth), asOf);
    }
}
