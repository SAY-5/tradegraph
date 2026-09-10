package dev.tradegraph.api.service;

import static org.assertj.core.api.Assertions.assertThat;

import dev.tradegraph.api.model.PathStep;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class OwnershipServiceTest {

    /** Growth fund, through its parent, on debt issued two lineage hops below Acme. */
    private static final List<PathStep> DEEP = List.of(
            new PathStep("F00000201", "Bigfund Growth Fund", PathStep.START),
            new PathStep("0000000002", "Bigfund Inc", PathStep.PARENT),
            new PathStep("S0000010101", "Acme Regional Unit 1 Ltd.", PathStep.HOLDS),
            new PathStep("S00000101", "Acme Finance Corp.", PathStep.PARENT),
            new PathStep("0000000001", "Acme Corp", PathStep.PARENT));

    private static final Map<String, BigDecimal> FRACTIONS = Map.of(
            "F00000201", BigDecimal.ONE,
            "S0000010101", new BigDecimal("0.75"),
            "S00000101", new BigDecimal("0.8"));

    @Test
    void ownershipIsNeededForEveryLineageHopButNotForHoldingOrTheStart() {
        assertThat(OwnershipService.ownedOn(DEEP)).containsExactly("F00000201", "S0000010101", "S00000101");
    }

    @Test
    void weightIsTheProductAlongThePath() {
        assertThat(OwnershipService.weight(DEEP, FRACTIONS)).isEqualByComparingTo("0.6");
    }

    @Test
    void aHopWithNoStatedFractionCountsAsWhole() {
        assertThat(OwnershipService.weight(DEEP, Map.of("S00000101", new BigDecimal("0.5"))))
                .isEqualByComparingTo("0.5");
    }

    @Test
    void aPathWithoutLineageHopsIsUnweighted() {
        List<PathStep> direct = List.of(
                new PathStep("0000000002", "Bigfund Inc", PathStep.START),
                new PathStep("0000000001", "Acme Corp", PathStep.HOLDS));
        assertThat(OwnershipService.weight(direct, FRACTIONS)).isEqualByComparingTo("1");
    }

    @Test
    void subsidiaryHopsAreOwnedByTheStepTheyReach() {
        List<PathStep> downward = List.of(
                new PathStep("F00000201", "Bigfund Growth Fund", PathStep.START),
                new PathStep("0000000002", "Bigfund Inc", PathStep.PARENT),
                new PathStep("S00000101", "Acme Finance Corp.", PathStep.SUBSIDIARY),
                new PathStep("0000000001", "Acme Corp", PathStep.HOLDS));
        assertThat(OwnershipService.ownedOn(downward)).containsExactly("F00000201", "S00000101");
        assertThat(OwnershipService.weight(downward, FRACTIONS)).isEqualByComparingTo("0.8");
    }
}
