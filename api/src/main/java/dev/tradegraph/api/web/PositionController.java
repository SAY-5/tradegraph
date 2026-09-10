package dev.tradegraph.api.web;

import dev.tradegraph.api.model.PositionDelta;
import dev.tradegraph.api.service.PeriodService;
import dev.tradegraph.api.service.PositionDeltaService;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
public class PositionController {

    private final PeriodService periods;
    private final PositionDeltaService delta;

    public PositionController(PeriodService periods, PositionDeltaService delta) {
        this.periods = periods;
        this.delta = delta;
    }

    @GetMapping("/periods")
    public List<LocalDate> periods() {
        return periods.periods();
    }

    @GetMapping("/positions/delta")
    public PositionDelta delta(
            @RequestParam("entity") @Pattern(regexp = EntityController.ID_PATTERN) String entity,
            @RequestParam("from") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam("to") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return delta.delta(entity, from, to);
    }
}
