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
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

/**
 * Where a fund family's value sits. The store groups the family's positions by the issuer
 * each one names; the shares and the cut off are applied here so the same rows answer any
 * threshold without another query.
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
        String query = templates.render("concentration", Map.of(
                "fund", iri,
                "periodValues", periods.valuesBlock("d", period),
                "holderClause", ExposureService.holderClause(iri, true, properties.exposure().maxDepth(),
                        properties.store().reasoning())));

        List<ConcentrationLine> all = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        for (Row r : sparql.select("concentration", query)) {
            BigDecimal value = r.decimal("value");
            all.add(new ConcentrationLine(new EntityRef(r.id("issuerEntity"), r.str("issuerEntityName"), List.of()),
                    value, BigDecimal.ZERO, r.asLong("positions")));
            total = total.add(value);
        }
        List<ConcentrationLine> above = above(all, total, minShare);
        return new ConcentrationResponse(entity, period.orElse(null), total, minShare, above.size(),
                above.stream().limit(Math.max(limit, 1)).toList(), (System.nanoTime() - started) / 1_000_000);
    }

    /** Lines whose share of {@code total} reaches {@code minShare}, largest first. */
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
