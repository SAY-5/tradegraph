"""Reporting period handling.

EDGAR writes the period of report in several shapes depending on the endpoint
and the form: ``reportDate`` in the submissions JSON is ISO, the header of an
older filing uses ``YYYYMMDD``, and hand maintained tables sometimes carry
``MM/DD/YYYY`` or a quarter label. Everything is normalised to the last day of
the calendar quarter the period falls in, which is the date a 13F-HR is filed
for and the date the API filters positions on.
"""

from __future__ import annotations

import re
from datetime import date

QUARTER_END = {1: (3, 31), 2: (6, 30), 3: (9, 30), 4: (12, 31)}

_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
_COMPACT = re.compile(r"^(\d{4})(\d{2})(\d{2})$")
_US = re.compile(r"^(\d{2})/(\d{2})/(\d{4})$")
_QUARTER = re.compile(r"^(\d{4})-?Q([1-4])$", re.IGNORECASE)


def parse_period(value: str) -> date:
    """Return the quarter end date for a reported period.

    Raises ``ValueError`` for anything that is not one of the accepted shapes,
    so a filing with a missing or malformed report date is dropped by the
    caller instead of reaching the graph with a wrong date.
    """
    text = (value or "").strip()
    m = _QUARTER.match(text)
    if m:
        month, day = QUARTER_END[int(m.group(2))]
        return date(int(m.group(1)), month, day)
    for pattern, order in ((_ISO, (1, 2, 3)), (_COMPACT, (1, 2, 3)), (_US, (3, 1, 2))):
        m = pattern.match(text)
        if m:
            y, mo, d = (int(m.group(i)) for i in order)
            return quarter_end(date(y, mo, d))
    raise ValueError(f"unrecognised period of report: {value!r}")


def quarter_end(day: date) -> date:
    """Last day of the calendar quarter containing ``day``."""
    month, last = QUARTER_END[(day.month - 1) // 3 + 1]
    return date(day.year, month, last)


def isoformat(value: str) -> str:
    """Normalise a reported period to an ISO quarter end date."""
    return parse_period(value).isoformat()
