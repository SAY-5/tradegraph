package dev.tradegraph.api.service;

import dev.tradegraph.api.config.TradeGraphProperties;
import dev.tradegraph.api.model.ConcentrationLine;
import dev.tradegraph.api.model.ConcentrationResponse;
import dev.tradegraph.api.model.EntityRef;
import dev.tradegraph.api.sparql.QueryTemplates;
import dev.tradegraph.api.sparql.Row;
import dev.tradegraph.api.sparql.SparqlClient;
import dev.tradegraph.api.sparql.SparqlValues;
import java.math.BigDecimal;
import java.math.MathContext;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

/**
 * Where a fund family's value sits. Three bounded queries answer it: the family total and
 * its issuer count in one row, the number of issuers above the share threshold in one row,
 * and the ranked page of lines itself, which the store cuts with the same threshold and a
 * LIMIT. Shares are then arithmetic on the page. Returning a row per issuer instead would
 * put no bound on the answer at all: a family in the committed sample holds as many as 276
 * distinct issuers in one reporting period.
 */
@Service
public class ConcentrationService {

    private final SparqlClient sparql;
    private final QueryTemplates templates;
    private final EntityService entities;
    private final PeriodService periods;
    private final TradeGraphProperties properties;

    public ConcentrationService(SparqlClient sparql, QueryTemplates templates, EntityService entities,
            PeriodService periods, TradeGraphProperties properties) {
        this.sparql = sparql;
        this.templates = templates;
        this.entities = entities;
        this.periods = periods;
        this.properties = properties;
    }

    public BigDecimal clampShare(BigDecimal requested) {
        BigDecimal share = requested == null ? properties.exposure().minShare() : requested;
        if (share.signum() < 0 || share.compareTo(BigDecimal.ONE) > 0) {
            throw new IllegalArgumentException("min_share must be between 0 and 1");
        }
        return share;
    }

    @Cacheable("concentration")
    public ConcentrationResponse concentration(String entityId, int limit, BigDecimal minShare, LocalDate asOf) {
        long started = System.nanoTime();
        EntityRef entity = entities.ref(entityId);
        String iri = SparqlValues.entityIri(entityId);
        Optional<LocalDate> period = periods.resolve(asOf);
        Map<String, String> family = Map.of(
                "fund", iri,
                "periodValues", periods.valuesBlock("d", period),
                "holderClause", ExposureService.holderClause(iri, true, properties.exposure().maxDepth(),
                        properties.store().reasoning()));

        Row totals = sparql.select("concentration_total",
                templates.render("concentration_total", family)).get(0);
        BigDecimal total = totals.decimal("total");
        if (total.signum() <= 0) {
            return new ConcentrationResponse(entity, period.orElse(null), BigDecimal.ZERO, minShare, 0,
                    List.of(), (System.nanoTime() - started) / 1_000_000);
        }

        Map<String, String> bounded = new HashMap<>(family);
        bounded.put("floor", total.multiply(minShare).toPlainString());
        bounded.put("limit", SparqlValues.integer(Math.max(limit, 1)));

        List<ConcentrationLine> page = new ArrayList<>();
        for (Row r : sparql.select("concentration", templates.render("concentration", bounded))) {
            page.add(new ConcentrationLine(new EntityRef(r.id("issuerEntity"), r.str("issuerEntityName"),
                    List.of()), r.decimal("value"), BigDecimal.ZERO, r.asLong("positions")));
        }

        // A threshold of zero keeps every issuer, which the total query already counted.
        long matches = minShare.signum() == 0
                ? totals.asLong("issuers")
                : sparql.select("concentration_matches",
                        templates.render("concentration_matches", bounded)).get(0).asLong("matches");

        return new ConcentrationResponse(entity, period.orElse(null), total, minShare, (int) matches,
                above(page, total, minShare), (System.nanoTime() - started) / 1_000_000);
    }

    /**
     * Shares for the page the store returned, largest first. The store has already applied
     * the same threshold; recomputing it here keeps the returned lines consistent with the
     * share arithmetic even when the floor literal rounds.
     */
    static List<ConcentrationLine> above(List<ConcentrationLine> lines, BigDecimal total, BigDecimal minShare) {
        if (total.signum() <= 0) {
            return List.of();
        }
        return lines.stream()
                .map(l -> new ConcentrationLine(l.issuer(), l.value(),
                        l.value().divide(total, MathContext.DECIMAL64), l.positions()))
                .filter(l -> l.share().compareTo(minShare) >= 0)
                .sorted((a, b) -> b.value().compareTo(a.value()))
                .toList();
    }
}
