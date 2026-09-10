package dev.tradegraph.api.web;

import dev.tradegraph.api.model.ConcentrationResponse;
import dev.tradegraph.api.service.ConcentrationService;
import jakarta.validation.constraints.Pattern;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
public class ExposureController {

    private final ConcentrationService concentration;

    public ExposureController(ConcentrationService concentration) {
        this.concentration = concentration;
    }

    @GetMapping("/exposure/concentration")
    public ConcentrationResponse concentration(
            @RequestParam("entity") @Pattern(regexp = EntityController.ID_PATTERN) String entity,
            @RequestParam(value = "limit", defaultValue = "10") int limit,
            @RequestParam(value = "min_share", required = false) BigDecimal minShare,
            @RequestParam(value = "as_of", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf) {
        return concentration.concentration(entity, limit, concentration.clampShare(minShare), asOf);
    }
}
