"""
What a message says, read from its text alone: the courtesies that close a
request ("non ho altro da aggiungere") are no change.

Read by the step of the quote (`src/services/quote_step.py`). Readers of the
ADK session events (last reply, tool calls, the client's words) are in
`src/adk/turn_reading.py`.
"""
from __future__ import annotations

import re

# A clause that only closes the request ("non ho altro da aggiungere", "è tutto"): left
# out before the change check, its "non"/"aggiungere" are no "not yet" and no more work.
# Whole clauses only: "non ho altro tempo" or "è tutto sbagliato" are no courtesy.
_CLAUSE = re.compile(r"[,.;!]+")
_COURTESY = re.compile(
    r"non ho (più )?(altro|nient['’ ]?altro|niente( altro)?)( da (aggiungere|dire|chiedere))?"
    r"|non (c['’]è|serve|mi serve) (più )?(altro|nient['’ ]?altro|niente( altro)?)"
    r"|nient['’ ]?altro|niente altro|(è|e['’]) tutto",
    re.IGNORECASE,
)


def without_courtesies(text: str) -> str:
    return ", ".join(c for c in (c.strip() for c in _CLAUSE.split(text)) if c and not _COURTESY.fullmatch(c))
