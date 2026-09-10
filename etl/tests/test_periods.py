from datetime import date

import pytest

from tradegraph_etl.periods import isoformat, parse_period, quarter_end


def test_parse_period_accepts_the_shapes_edgar_uses():
    assert parse_period("2024-06-30") == date(2024, 6, 30)
    assert parse_period("20240630") == date(2024, 6, 30)
    assert parse_period("06/30/2024") == date(2024, 6, 30)
    assert parse_period("2024-Q2") == date(2024, 6, 30)
    assert parse_period(" 2024Q2 ") == date(2024, 6, 30)


def test_parse_period_snaps_a_mid_quarter_date_to_the_quarter_end():
    assert parse_period("2024-05-15") == date(2024, 6, 30)
    assert parse_period("2024-01-02") == date(2024, 3, 31)
    assert parse_period("2023-12-31") == date(2023, 12, 31)


@pytest.mark.parametrize("value", ["", "  ", "June 2024", "2024-13-01", "24-06-30", None])
def test_parse_period_rejects_anything_else(value):
    with pytest.raises(ValueError):
        parse_period(value)


def test_quarter_end_and_isoformat():
    assert quarter_end(date(2024, 8, 1)) == date(2024, 9, 30)
    assert isoformat("20240401") == "2024-06-30"
