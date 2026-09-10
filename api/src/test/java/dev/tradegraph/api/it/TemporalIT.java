package dev.tradegraph.api.it;

import static org.assertj.core.api.Assertions.assertThat;

import dev.tradegraph.api.model.ExposureResponse;
import dev.tradegraph.api.model.PositionDelta;
import dev.tradegraph.api.model.TradeRecord;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;

/** Exposure, positions and the delta report over a store that holds two reporting periods. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class TemporalIT {

    private static final GenericContainer<?> FUSEKI = FusekiSupport.start();
    private static final String FUND = "F00000201";
    private static final String ACME = "0000000001";

    @Autowired
    private TestRestTemplate rest;

    @DynamicPropertySource
    static void storeProperties(DynamicPropertyRegistry registry) {
        registry.add("tradegraph.store.query-url", () -> FusekiSupport.queryUrl(FUSEKI));
    }

    @BeforeAll
    static void loadFixture() {
        FusekiSupport.loadFixture(FUSEKI, "/temporal.ttl");
    }

    @Test
    void periodsAreListedNewestFirst() {
        List<LocalDate> periods = rest.exchange("/periods", HttpMethod.GET, null,
                new ParameterizedTypeReference<List<LocalDate>>() { }).getBody();
        assertThat(periods).containsExactly(LocalDate.of(2024, 6, 30), LocalDate.of(2024, 3, 31));
    }

    @Test
    void exposureAnswersTheLatestPeriodByDefault() {
        ExposureResponse latest = exposure("");
        assertThat(latest.asOf()).isEqualTo(LocalDate.of(2024, 6, 30));
        assertThat(latest.totalValue()).isEqualByComparingTo(new BigDecimal("2200.0"));
        assertThat(latest.positions()).isEqualTo(2);
    }

    @Test
    void exposureAsOfAnEarlierPeriodExcludesLaterPositions() {
        ExposureResponse earlier = exposure("&as_of=2024-03-31");
        assertThat(earlier.asOf()).isEqualTo(LocalDate.of(2024, 3, 31));
        assertThat(earlier.totalValue()).isEqualByComparingTo(new BigDecimal("1400.0"));
        assertThat(earlier.directValue()).isEqualByComparingTo(new BigDecimal("1000.0"));
        assertThat(earlier.viaSubsidiariesValue()).isEqualByComparingTo(new BigDecimal("400.0"));
        assertThat(earlier.byInstrument()).extracting(l -> l.instrument().cusip())
                .containsExactlyInAnyOrder("900000001", "900000002")
                .doesNotContain("900000003");
    }

    @Test
    void anAsOfBetweenPeriodsFallsBackToTheLastFiledOne() {
        assertThat(exposure("&as_of=2024-05-01").asOf()).isEqualTo(LocalDate.of(2024, 3, 31));
        ExposureResponse beforeAnyFiling = exposure("&as_of=2023-12-31");
        assertThat(beforeAnyFiling.asOf()).isNull();
        assertThat(beforeAnyFiling.totalValue()).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    void positionsFollowTheSameAsOfRule() {
        assertThat(trades("")).extracting(TradeRecord::value)
                .containsExactly(new BigDecimal("1500.0"), new BigDecimal("700.0"));
        assertThat(trades("&as_of=2024-03-31")).extracting(TradeRecord::value)
                .containsExactly(new BigDecimal("1000.0"), new BigDecimal("400.0"));
    }

    @Test
    void deltaReportsOpenedClosedAndMovedLines() {
        PositionDelta delta = rest.getForObject(
                "/positions/delta?entity=" + FUND + "&from=2024-03-31&to=2024-06-30", PositionDelta.class);
        assertThat(delta.from()).isEqualTo(LocalDate.of(2024, 3, 31));
        assertThat(delta.to()).isEqualTo(LocalDate.of(2024, 6, 30));
        assertThat(delta.added()).extracting(l -> l.instrument().cusip()).containsExactly("900000003");
        assertThat(delta.removed()).extracting(l -> l.instrument().cusip()).containsExactly("900000002");
        assertThat(delta.changed()).singleElement().satisfies(c -> {
            assertThat(c.instrument().cusip()).isEqualTo("900000001");
            assertThat(c.valueChange()).isEqualByComparingTo(new BigDecimal("500.0"));
            assertThat(c.toQuantity()).isEqualByComparingTo(new BigDecimal("120"));
        });
        assertThat(delta.addedValue()).isEqualByComparingTo(new BigDecimal("700.0"));
        assertThat(delta.removedValue()).isEqualByComparingTo(new BigDecimal("400.0"));
    }

    @Test
    void deltaOverOnePeriodIsEmptyAndAReversedRangeIsRejected() {
        PositionDelta same = rest.getForObject(
                "/positions/delta?entity=" + FUND + "&from=2024-06-30&to=2024-06-30", PositionDelta.class);
        assertThat(same.added()).isEmpty();
        assertThat(same.removed()).isEmpty();
        assertThat(same.changed()).isEmpty();

        assertThat(rest.getForEntity("/positions/delta?entity=" + FUND + "&from=2024-06-30&to=2024-03-31",
                String.class).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(rest.getForEntity("/positions/delta?entity=" + FUND + "&from=nonsense&to=2024-06-30",
                String.class).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    private ExposureResponse exposure(String extra) {
        return rest.getForObject("/entities/" + FUND + "/exposure?issuer=" + ACME + extra, ExposureResponse.class);
    }

    private List<TradeRecord> trades(String extra) {
        return rest.exchange("/trades?entity=" + FUND + extra, HttpMethod.GET, null,
                new ParameterizedTypeReference<List<TradeRecord>>() { }).getBody();
    }
}
