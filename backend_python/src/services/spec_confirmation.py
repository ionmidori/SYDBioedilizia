"""What the client confirmed on the card, against a new analysis (Phase 140, step 3).

A measure or an element choice the client confirmed changes only from the card.
A new analysis that gives another value leaves it in place: the new value is
kept as a proposal the card shows to the client, and the team gets a check
(`admin_check`). Pure: no I/O.
"""
from collections.abc import Mapping
from decimal import Decimal

from src.core.money import to_decimal
from src.schemas.assembly_library import MEASURE_LABELS
from src.schemas.intervention_spec import RoomInterventionSpec, StoredElementChoice, StoredMeasure
from src.services.insight_engine import ElementChoice, InsightAnalysis
from src.services.intervention_expansion import ACTION_LABELS, requested_actions


def _number(value: float) -> str:
    return f"{to_decimal(value).normalize():f}"


def _confirmed_measures(spec: RoomInterventionSpec) -> dict[str, StoredMeasure]:
    return {m.name: m for m in spec.measures if m.source == "confirmed"}


def _confirmed_choices(spec: RoomInterventionSpec) -> dict[str, StoredElementChoice]:
    return {c.element: c for c in spec.element_choices if c.confirmed}


def _merged_measure(fresh: StoredMeasure | None, confirmed: StoredMeasure, notes: list[str]) -> StoredMeasure:
    """The confirmed measure, with the model's new value as its proposal.

    No new value from the model (or only the room brief's, which is no new
    analysis): the measure stays as it was, an unanswered proposal included."""
    if fresh is None or fresh.source == "brief":
        return confirmed
    if fresh.value == confirmed.value:
        return confirmed.model_copy(update={"proposed": None})
    notes.append(
        f"{MEASURE_LABELS.get(confirmed.name, confirmed.name)}: il cliente ha confermato {_number(confirmed.value)}, "
        f"la nuova analisi indica {_number(fresh.value)}. Usato il valore confermato, proposta mostrata al cliente"
    )
    return confirmed.model_copy(update={"proposed": fresh.value})


def apply_confirmations(
    fresh: RoomInterventionSpec, stored: RoomInterventionSpec | None
) -> tuple[RoomInterventionSpec, list[str]]:
    """The spec of a new analysis (`fresh`) with what the client confirmed in the
    stored one, and the team's checks for the measures the two disagree on (the
    element choices are checked against the analysis: `choice_checks`).

    Everything else (packages, extra items, unconfirmed values) comes from `fresh`."""
    if stored is None:
        return fresh, []
    notes: list[str] = []
    confirmed = _confirmed_measures(stored)
    by_name = {m.name: m for m in fresh.measures}
    measures = [_merged_measure(m, confirmed[m.name], notes) if m.name in confirmed else m for m in fresh.measures]
    measures += [m for name, m in confirmed.items() if name not in by_name]

    chosen = _confirmed_choices(stored)
    choices = [*chosen.values(), *(c for c in fresh.element_choices if c.element not in chosen)]
    return fresh.model_copy(update={"measures": measures, "element_choices": choices}), notes


def choice_checks(analysis: InsightAnalysis, stored: RoomInterventionSpec | None) -> list[str]:
    """The team's checks for the confirmed element choices the model's analysis
    contradicts. Read from the analysis: the spec never stores a "replace"."""
    if stored is None:
        return []
    model = requested_actions(analysis)
    return [
        f"{element}: il cliente ha confermato \"{ACTION_LABELS[kept.action]}\", la nuova analisi "
        f"indica \"{ACTION_LABELS[model[element]]}\". Usata la scelta confermata"
        for element, kept in _confirmed_choices(stored).items()
        if element in model and model[element] != kept.action
    ]


def expansion_inputs(
    analysis: InsightAnalysis, measures: Mapping[str, Decimal], stored: RoomInterventionSpec | None
) -> tuple[InsightAnalysis, dict[str, Decimal]]:
    """The analysis and the measures `expand` reads, with the client's confirmations.

    A confirmed measure replaces the resolved one, and the model's values for it
    are left out (they are no conflict: the client decided). Confirmed element
    choices come first, so they win over the model's (`expand` reads the first)."""
    if stored is None:
        return analysis, dict(measures)
    confirmed = {name: to_decimal(m.value) for name, m in _confirmed_measures(stored).items()}
    chosen = _confirmed_choices(stored)
    updated = analysis.model_copy(update={
        "measures": [m for m in analysis.measures if m.name not in confirmed],
        "element_choices": [
            *(ElementChoice(element=c.element, action=c.action) for c in chosen.values()),
            *(c for c in analysis.element_choices if c.element not in chosen),
        ],
    })
    return updated, {**measures, **confirmed}
