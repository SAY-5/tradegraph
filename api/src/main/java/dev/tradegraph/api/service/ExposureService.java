package dev.tradegraph.api.service;

import dev.tradegraph.api.config.TradeGraphProperties;
import dev.tradegraph.api.model.EntityRef;
import dev.tradegraph.api.model.ExposureLine;
import dev.tradegraph.api.model.ExposureResponse;
import dev.tradegraph.api.model.HolderTotal;
import dev.tradegraph.api.model.Instrument;
import dev.tradegraph.api.model.PathStep;
import dev.tradegraph.api.sparql.QueryTemplates;
import dev.tradegraph.api.sparql.Row;
import dev.tradegraph.api.sparql.SparqlClient;
import dev.tradegraph.api.sparql.SparqlPaths;
import dev.tradegraph.api.sparql.SparqlValues;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

/**
 * Exposure of a fund to an issuer. One aggregate SPARQL query finds every contributing
 * (holder, issuer entity, instrument) group; the lineage paths that explain each group are
 * assembled from cached ancestor chains.
 */
@Service
public class ExposureService {

    private final SparqlClient sparql;
    private final QueryTemplates templates;
    private final EntityService entities;
    private final LineageService lineage;
    private final PeriodService periods;
    private final TradeGraphProperties properties;

    public ExposureService(SparqlClient sparql, QueryTemplates templates, EntityService entities,
            LineageService lineage, PeriodService periods, TradeGraphProperties properties) {
        this.sparql = sparql;
        this.templates = templates;
        this.entities = entities;
        this.lineage = lineage;
        this.periods = periods;
        this.properties = properties;
    }

    public int clampDepth(Integer requested) {
        int max = properties.exposure().maxDepth();
        return requested == null ? max : Math.min(Math.max(requested, 1), max);
    }

    @Cacheable("exposure")
    public ExposureResponse exposure(String fundId, String issuerId, boolean includeAffiliates,
            boolean includeSubsidiaries, int depth, LocalDate asOf) {
        long started = System.nanoTime();
        EntityRef fund = entities.ref(fundId);
        EntityRef issuer = entities.ref(issuerId);
        String fundIri = SparqlValues.entityIri(fundId);
        String issuerIri = SparqlValues.entityIri(issuerId);
        Optional<LocalDate> period = periods.resolve(asOf);

        String query = templates.render("exposure", Map.of(
                "fund", fundIri,
                "issuer", issuerIri,
                "depth", SparqlValues.integer(depth),
                "periodValues", periods.valuesBlock("d", period),
                "holderClause", holderClause(fundIri, includeAffiliates, depth),
                "issuerClause", issuerClause(issuerIri, includeSubsidiaries, depth)));

        List<ExposureLine> lines = new ArrayList<>();
        Map<String, HolderTotal> byHolder = new LinkedHashMap<>();
        BigDecimal total = BigDecimal.ZERO;
        BigDecimal direct = BigDecimal.ZERO;
        BigDecimal viaSubs = BigDecimal.ZERO;
        BigDecimal viaAffiliates = BigDecimal.ZERO;
        long positions = 0;
        int longest = 0;
        for (Row r : sparql.select(query)) {
            ExposureLine line = toLine(r, fund, issuer, depth);
            lines.add(line);
            total = total.add(line.value());
            positions += line.positions();
            longest = Math.max(longest, line.pathLength());
            if (line.direct()) {
                direct = direct.add(line.value());
            } else if (line.viaSubsidiary() && !line.viaAffiliate()) {
                viaSubs = viaSubs.add(line.value());
            } else {
                viaAffiliates = viaAffiliates.add(line.value());
            }
            byHolder.merge(line.holder().id(), new HolderTotal(line.holder(), line.value(), line.positions()),
                    (a, b) -> new HolderTotal(a.holder(), a.value().add(b.value()), a.positions() + b.positions()));
        }
        List<HolderTotal> holders = byHolder.values().stream()
                .sorted((a, b) -> b.value().compareTo(a.value()))
                .toList();
        return new ExposureResponse(fund, issuer, period.orElse(null), total, direct, viaSubs, viaAffiliates, positions,
                includeAffiliates, includeSubsidiaries, depth, longest, lines, holders,
                (System.nanoTime() - started) / 1_000_000);
    }

    static String holderClause(String fundIri, boolean includeAffiliates, int depth) {
        if (!includeAffiliates) {
            return "BIND(" + fundIri + " AS ?holder)";
        }
        // The zero hop case is a FILTER rather than a BIND inside a UNION branch: a group
        // pattern cannot see ?root (bottom-up evaluation), so BIND(?root AS ?holder) would be unbound.
        return "{ BIND(" + fundIri + " AS ?root) } " + SparqlPaths.unionHops(fundIri, "?root", 1, depth) + "\n"
                + "  FILTER NOT EXISTS { ?root tg:subsidiaryOf ?above }\n"
                + "  ?holder a tg:Fund .\n"
                + "  FILTER(?holder = ?root || EXISTS { ?holder "
                + SparqlPaths.bounded(SparqlPaths.SUBSIDIARY_OF, 1, depth) + " ?root })";
    }

    static String issuerClause(String issuerIri, boolean includeSubsidiaries, int depth) {
        if (!includeSubsidiaries) {
            return "BIND(" + issuerIri + " AS ?issuerEntity)";
        }
        return "{ BIND(" + issuerIri + " AS ?issuerEntity) } "
                + SparqlPaths.unionHops("?issuerEntity", issuerIri, 1, depth);
    }

    private ExposureLine toLine(Row r, EntityRef fund, EntityRef issuer, int depth) {
        EntityRef holder = new EntityRef(r.id("holder"), r.str("holderName"), List.of());
        EntityRef issuerEntity = new EntityRef(r.id("issuerEntity"), r.str("issuerEntityName"), List.of());
        Instrument instrument = new Instrument(r.str("cusip"), r.str("ticker"), r.str("class"));
        boolean viaAffiliate = !holder.id().equals(fund.id());
        boolean viaSubsidiary = !issuerEntity.id().equals(issuer.id());
        List<PathStep> path = buildPath(fund, holder, issuerEntity, issuer, depth);
        return new ExposureLine(instrument, holder, issuerEntity, r.decimal("value"), r.decimal("quantity"),
                r.asLong("positions"), r.date("asOf"), !viaAffiliate && !viaSubsidiary, viaAffiliate,
                viaSubsidiary, path.size() - 1, path, explain(path, instrument));
    }

    /** fund -(parent)*-> root -(subsidiary)*-> holder -(holds)-> issuerEntity -(parent)*-> issuer. */
    List<PathStep> buildPath(EntityRef fund, EntityRef holder, EntityRef issuerEntity, EntityRef issuer,
            int depth) {
        List<PathStep> path = new ArrayList<>();
        path.add(new PathStep(fund.id(), fund.name(), PathStep.START));
        if (!holder.id().equals(fund.id())) {
            List<EntityRef> up = lineage.ancestors(fund.id(), depth);
            List<EntityRef> holderUp = lineage.ancestors(holder.id(), depth);
            String root = up.isEmpty() ? fund.id() : up.get(up.size() - 1).id();
            for (EntityRef a : up) {
                path.add(new PathStep(a.id(), a.name(), PathStep.PARENT));
                if (a.id().equals(root)) {
                    break;
                }
            }
            if (!holder.id().equals(root)) {
                int rootIndex = indexOf(holderUp, root);
                for (int i = rootIndex - 1; i >= 0; i--) {
                    path.add(new PathStep(holderUp.get(i).id(), holderUp.get(i).name(), PathStep.SUBSIDIARY));
                }
                path.add(new PathStep(holder.id(), holder.name(), PathStep.SUBSIDIARY));
            }
        }
        path.add(new PathStep(issuerEntity.id(), issuerEntity.name(), PathStep.HOLDS));
        if (!issuerEntity.id().equals(issuer.id())) {
            for (EntityRef a : lineage.ancestors(issuerEntity.id(), depth)) {
                path.add(new PathStep(a.id(), a.name(), PathStep.PARENT));
                if (a.id().equals(issuer.id())) {
                    break;
                }
            }
        }
        return path;
    }

    private static int indexOf(List<EntityRef> refs, String id) {
        for (int i = 0; i < refs.size(); i++) {
            if (refs.get(i).id().equals(id)) {
                return i;
            }
        }
        return refs.size();
    }

    static String explain(List<PathStep> path, Instrument instrument) {
        StringBuilder sb = new StringBuilder(path.get(0).name());
        for (int i = 1; i < path.size(); i++) {
            PathStep step = path.get(i);
            switch (step.hop()) {
                case PathStep.PARENT -> sb.append(" is a subsidiary of ").append(step.name());
                case PathStep.SUBSIDIARY -> sb.append(", whose subsidiary ").append(step.name());
                case PathStep.HOLDS -> sb.append(" holds ").append(instrument.instrumentClass())
                        .append(instrument.ticker() != null ? " " + instrument.ticker() : "")
                        .append(" issued by ").append(step.name());
                default -> sb.append(" ").append(step.name());
            }
        }
        return sb.toString();
    }
}
