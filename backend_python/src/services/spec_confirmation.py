"""What the client confirmed on the card, against a new analysis (Phase 140, step 3).

A measure or an element choice the client confirmed changes only from the card.
A new analysis that gives another value leaves it in place: the new value is
kept as a proposal the card shows to the client, and the team gets a check
(`admin_check`). What the card confirms (`confirm`) is expanded again by code,
without the model (`analysis_from_spec`). Pure: no I/O.
"""
from collections.abc import Mapping
from decimal import Decimal

from src.core.money import to_decimal
from src.schemas.assembly_library import MEASURE_LABELS, ElementAction
from src.schemas.confirmation import ConfirmationUpdate
from src.schemas.intervention_spec import RoomInterventionSpec, StoredElementChoice, StoredMeasure
from src.services.insight_engine import ElementChoice, InsightAnalysis
from src.services.intervention_expansion import ACTION_LABELS, requested_actions

# Reasoning of a single line recomputed from the stored spec (the model's own is not stored).
_STORED_EXTRA_REASONING = "Voce singola dell'ultima analisi, ricalcolata con le misure confermate"


def _number(value: float) -> str:
    return f"{to_decimal(value).normalize():f}"


def _confirmed_measures(spec: RoomInterventionSpec) -> dict[str, StoredMeasure]:
    return {m.name: m for m in spec.measures if m.source == "confirmed"}


def _confirmed_choices(spec: RoomInterventionSpec) -> dict[str, StoredElementChoice]:
    return {c.element: c for c in spec.element_choices if c.confirmed}


def _settled(spec: RoomInterventionSpec) -> RoomInterventionSpec:
    """A confirmed measure is neither missing nor in conflict any more."""
    confirmed = _confirmed_measures(spec)
    return spec.model_copy(update={
        "missing_measures": [name for name in spec.missing_measures if name not in confirmed],
        "conflicts": {name: values for name, values in spec.conflicts.items() if name not in confirmed},
    })


def _merged_measure(fresh: StoredMeasure | None, confirmed: StoredMeasure, notes: list[str]) -> StoredMeasure:
    """The confirmed measure, with the model's new value as its proposal.

    No new value from the model (or only the room brief's, which is no new
    analysis): the measure stays as it was, an unanswered proposal included."""
    if fresh is None or fresh.source == "brief":
        return confirmed
    if fresh.value == confirmed.value:
        return confirmed.model_copy(update={"proposed": None})
    notes.append(_proposal_note(confirmed.name, confirmed.value, fresh.value))
    return confirmed.model_copy(update={"proposed": fresh.value})


def _proposal_note(name: str, confirmed: float, proposed: float) -> str:
    return (
        f"{MEASURE_LABELS.get(name, name)}: il cliente ha confermato {_number(confirmed)}, "
        f"la nuova analisi indica {_number(proposed)}. Usato il valore confermato, proposta mostrata al cliente"
    )


def proposal_checks(spec: RoomInterventionSpec) -> list[str]:
    """The team's checks for the proposals the client has not answered yet: a draft
    recomputed without the model keeps them (the analysis that made them is gone)."""
    return [_proposal_note(m.name, m.value, m.proposed) for m in spec.measures if m.proposed is not None]


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
    return _settled(fresh.model_copy(update={"measures": measures, "element_choices": choices})), notes


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


def confirmations_only(spec: RoomInterventionSpec | None) -> RoomInterventionSpec | None:
    """What the client confirmed in `spec`, nothing else (None: nothing confirmed).

    How the confirmations of a chat without rooms reach the unit that quotes it
    once the project has rooms: the new analysis supplies everything else."""
    if spec is None:
        return None
    measures = list(_confirmed_measures(spec).values())
    choices = list(_confirmed_choices(spec).values())
    if not measures and not choices:
        return None
    return spec.model_copy(update={
        "measures": measures, "element_choices": choices, "packages": [], "extra_items": [],
        "unmapped_work_requests": [], "missing_measures": [], "conflicts": {},
    })


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


def _confirmed_values(spec: RoomInterventionSpec | None) -> tuple[dict[str, float], dict[str, ElementAction]]:
    if spec is None:
        return {}, {}
    return (
        {name: m.value for name, m in _confirmed_measures(spec).items()},
        {element: c.action for element, c in _confirmed_choices(spec).items()},
    )


def same_confirmations(a: RoomInterventionSpec | None, b: RoomInterventionSpec | None) -> bool:
    """Whether the client confirmed the same values in both (proposals and the rest aside)."""
    return _confirmed_values(a) == _confirmed_values(b)


def confirm(spec: RoomInterventionSpec, update: ConfirmationUpdate) -> RoomInterventionSpec:
    """The section's spec with what the client confirmed on the card: each measure
    becomes the client's (any proposal is answered), each element choice too."""
    measures = {m.name: StoredMeasure(name=m.name, value=m.value, source="confirmed") for m in update.measures}
    choices = {
        c.element: StoredElementChoice(element=c.element, action=c.action, confirmed=True)
        for c in update.element_choices
    }
    stored_names = {m.name for m in spec.measures}
    stored_elements = {c.element for c in spec.element_choices}
    return _settled(spec.model_copy(update={
        "measures": [
            *(measures.get(m.name, m) for m in spec.measures),
            *(m for name, m in measures.items() if name not in stored_names),
        ],
        "element_choices": [
            *(choices.get(c.element, c) for c in spec.element_choices),
            *(c for element, c in choices.items() if element not in stored_elements),
        ],
    }))


def analysis_from_spec(spec: RoomInterventionSpec, summary: str) -> InsightAnalysis:
    """The analysis `expand` reads, rebuilt from a stored spec (no model call). Its
    measures are not in it: `expand` takes them from `spec_measures`."""
    # Validated from data: the response-schema models declare their defaults positionally.
    return InsightAnalysis.model_validate({
        "summary": summary,
        "packages": [{"assembly_id": p.assembly_id, "conditions": list(p.conditions)} for p in spec.packages],
        "element_choices": [{"element": c.element, "action": c.action} for c in spec.element_choices],
        "suggestions": [
            {"sku": item.sku, "qty": item.qty, "ai_reasoning": _STORED_EXTRA_REASONING} for item in spec.extra_items
        ],
        "unmapped_work_requests": list(spec.unmapped_work_requests),
    })


def spec_measures(spec: RoomInterventionSpec) -> dict[str, Decimal]:
    """The measures `expand` computes the section's lines from (a proposal is never used)."""
    return {m.name: to_decimal(m.value) for m in spec.measures}
