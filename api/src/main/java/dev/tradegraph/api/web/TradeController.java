package dev.tradegraph.api.web;

import dev.tradegraph.api.model.TradeRecord;
import dev.tradegraph.api.service.TradeService;
import jakarta.validation.constraints.Pattern;
import java.util.List;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
public class TradeController {

    private final TradeService trades;

    public TradeController(TradeService trades) {
        this.trades = trades;
    }

    @GetMapping("/trades")
    public List<TradeRecord> trades(
            @RequestParam("entity") @Pattern(regexp = EntityController.ID_PATTERN) String entity,
            @RequestParam(value = "limit", defaultValue = "50") int limit,
            @RequestParam(value = "offset", defaultValue = "0") int offset) {
        return trades.forEntity(entity, limit, offset);
    }
}
