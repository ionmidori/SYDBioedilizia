"""Phase 140 step 3: what the client confirmed on the card survives a new analysis.

A confirmed measure or element choice changes only from the card: a different
value from the model becomes a proposal for the client and a check for the team.
"""
from datetime import UTC, datetime
from decimal import Decimal

from src.schemas.confirmation import ChoiceConfirmation, ConfirmationUpdate, MeasureConfirmation
from src.schemas.intervention_spec import (
    RoomInterventionSpec,
    StoredElementChoice,
    StoredExtraItem,
    StoredMeasure,
    StoredPackage,
)
from src.services.insight_engine import ElementChoice, InsightAnalysis, SpecMeasure
from src.services.spec_confirmation import (
    analysis_from_spec,
    apply_confirmations,
    choice_checks,
    confirm,
    confirmations_only,
    expansion_inputs,
    same_confirmations,
    spec_measures,
)

T0 = datetime(2026, 11, 12, 9, 0, tzinfo=UTC)


def _spec(
    measures: list[StoredMeasure] | None = None, choices: list[StoredElementChoice] | None = None
) -> RoomInterventionSpec:
    return RoomInterventionSpec(
        measures=measures or [], element_choices=choices or [], library_version="2.1.0", generated_at=T0
    )


def _confirmed(name: str, value: float, proposed: float | None = None) -> StoredMeasure:
    return StoredMeasure(name=name, value=value, source="confirmed", proposed=proposed)


def test_without_a_stored_spec_the_fresh_one_is_kept() -> None:
    fresh = _spec([StoredMeasure(name="mq", value=6, source="declared")])
    assert apply_confirmations(fresh, None) == (fresh, [])


def test_confirmed_measure_wins_and_records_proposal() -> None:
    fresh = _spec([StoredMeasure(name="mq", value=6, source="declared")])
    merged, notes = apply_confirmations(fresh, _spec([_confirmed("mq", 8)]))

    assert merged.measures == [_confirmed("mq", 8, proposed=6)]
    assert len(notes) == 1
    assert "pavimento della stanza (m²)" in notes[0] and "8" in notes[0] and "6" in notes[0]


def test_unconfirmed_measure_takes_model_value() -> None:
    stored = _spec([StoredMeasure(name="mq", value=5, source="estimated")])
    fresh = _spec([StoredMeasure(name="mq", value=6, source="declared")])
    assert apply_confirmations(fresh, stored) == (fresh, [])


def test_model_agreeing_with_the_confirmed_value_clears_the_proposal() -> None:
    fresh = _spec([StoredMeasure(name="mq", value=8, source="declared")])
    merged, notes = apply_confirmations(fresh, _spec([_confirmed("mq", 8, proposed=6)]))
    assert merged.measures == [_confirmed("mq", 8)]
    assert notes == []


def test_a_brief_value_is_no_proposal() -> None:
    """The room brief is not a new analysis: it would re-propose the same value every turn."""
    fresh = _spec([StoredMeasure(name="mq", value=5, source="brief")])
    merged, notes = apply_confirmations(fresh, _spec([_confirmed("mq", 8)]))
    assert merged.measures == [_confirmed("mq", 8)]
    assert notes == []


def test_confirmed_measure_kept_when_model_drops_it() -> None:
    fresh = _spec([StoredMeasure(name="mq_pareti", value=14, source="photo")])
    merged, notes = apply_confirmations(fresh, _spec([_confirmed("mq", 8, proposed=6)]))
    # The client has not answered the earlier proposal yet: it stays.
    assert merged.measures == [StoredMeasure(name="mq_pareti", value=14, source="photo"), _confirmed("mq", 8, 6)]
    assert notes == []


def test_confirmed_choice_wins() -> None:
    fresh = _spec(choices=[
        StoredElementChoice(element="sanitari", action="keep"),
        StoredElementChoice(element="piatto_doccia", action="reuse"),
    ])
    stored = _spec(choices=[
        StoredElementChoice(element="sanitari", action="replace", confirmed=True),
        StoredElementChoice(element="rubinetteria", action="keep"),  # not confirmed: the model decides
    ])
    merged, notes = apply_confirmations(fresh, stored)

    assert merged.element_choices == [
        StoredElementChoice(element="sanitari", action="replace", confirmed=True),
        StoredElementChoice(element="piatto_doccia", action="reuse"),
    ]
    assert notes == []  # the choices are checked against the analysis: choice_checks


def test_choice_checks_compare_the_model_explicit_choices() -> None:
    """The stored spec never keeps "replace": the analysis says what the model chose."""
    stored = _spec(choices=[
        StoredElementChoice(element="sanitari", action="keep", confirmed=True),
        StoredElementChoice(element="piatto_doccia", action="replace", confirmed=True),
        StoredElementChoice(element="rubinetteria", action="reuse", confirmed=True),
        StoredElementChoice(element="mobile_bagno", action="keep"),  # not confirmed
    ])
    analysis = InsightAnalysis(summary="Bagno", element_choices=[
        ElementChoice(element="sanitari", action="replace"),
        ElementChoice(element="piatto_doccia", action="keep"),
        ElementChoice(element="mobile_bagno", action="replace"),
    ])
    notes = choice_checks(analysis, stored)

    assert len(notes) == 2
    assert "sanitari" in notes[0] and "lascia in posa" in notes[0] and "sostituisci" in notes[0]
    assert "piatto_doccia" in notes[1]


def test_choice_checks_without_confirmations() -> None:
    analysis = InsightAnalysis(summary="Bagno", element_choices=[ElementChoice(element="sanitari", action="keep")])
    assert choice_checks(analysis, None) == []
    assert choice_checks(analysis, _spec(choices=[StoredElementChoice(element="sanitari", action="keep")])) == []


def test_the_rest_of_the_spec_comes_from_the_new_analysis() -> None:
    fresh = _spec().model_copy(update={"unmapped_work_requests": ["Vespaio"], "library_version": "2.2.0"})
    stored = _spec([_confirmed("mq", 8)]).model_copy(update={"unmapped_work_requests": ["Vecchio"]})
    merged, _ = apply_confirmations(fresh, stored)
    assert merged.unmapped_work_requests == ["Vespaio"] and merged.library_version == "2.2.0"


def test_expansion_inputs_use_the_confirmed_values() -> None:
    analysis = InsightAnalysis(
        summary="Bagno",
        measures=[SpecMeasure(name="mq", value=6, source="declared"), SpecMeasure(name="mq", value=9, source="photo")],
        element_choices=[ElementChoice(element="sanitari", action="keep")],
    )
    stored = _spec(
        [_confirmed("mq", 8), StoredMeasure(name="n_porte", value=2, source="estimated")],
        [StoredElementChoice(element="sanitari", action="replace", confirmed=True)],
    )
    for_expansion, measures = expansion_inputs(analysis, {"mq_pareti": Decimal(14)}, stored)

    assert measures == {"mq_pareti": Decimal(14), "mq": Decimal(8)}  # an unconfirmed stored value is not used
    # The model's values of a confirmed measure are not a conflict any more.
    assert for_expansion.measures == []
    assert [(c.element, c.action) for c in for_expansion.element_choices] == [("sanitari", "replace")]


def test_expansion_inputs_without_a_stored_spec_are_unchanged() -> None:
    analysis = InsightAnalysis(summary="Bagno", measures=[SpecMeasure(name="mq", value=6, source="declared")])
    measures = {"mq": Decimal(6)}
    assert expansion_inputs(analysis, measures, None) == (analysis, measures)


def test_confirmations_only_keeps_what_the_client_confirmed() -> None:
    chat = _spec(
        [_confirmed("mq", 8, proposed=6), StoredMeasure(name="mq_pareti", value=14, source="photo")],
        [StoredElementChoice(element="sanitari", action="keep", confirmed=True),
         StoredElementChoice(element="piatto_doccia", action="reuse")],
    ).model_copy(update={"unmapped_work_requests": ["Vespaio"], "missing_measures": ["n_porte"]})

    kept = confirmations_only(chat)
    assert kept is not None
    assert kept.measures == [_confirmed("mq", 8, proposed=6)]
    assert kept.element_choices == [StoredElementChoice(element="sanitari", action="keep", confirmed=True)]
    assert kept.unmapped_work_requests == [] and kept.missing_measures == []


def test_confirmations_only_without_confirmations() -> None:
    assert confirmations_only(None) is None
    assert confirmations_only(_spec([StoredMeasure(name="mq", value=6, source="declared")])) is None


def test_a_confirmed_measure_is_never_missing_nor_in_conflict() -> None:
    """A confirmation made during the analysis: the fresh spec still lists the measure as missing."""
    fresh = _spec().model_copy(update={"missing_measures": ["mq", "n_porte"], "conflicts": {"mq": [6.0, 9.0]}})
    merged, _ = apply_confirmations(fresh, _spec([_confirmed("mq", 8)]))
    assert merged.missing_measures == ["n_porte"] and merged.conflicts == {}


# ── The card: a section confirmed by the client ───────────────────────────────


def test_confirm_marks_measures_and_choices_as_the_client_s() -> None:
    stored = _spec(
        [StoredMeasure(name="mq", value=6, source="declared"), _confirmed("mq_pareti", 14, proposed=15)],
        [StoredElementChoice(element="sanitari", action="keep")],
    ).model_copy(update={"missing_measures": ["n_porte"], "conflicts": {"n_porte": [1.0, 2.0]}})
    update = ConfirmationUpdate(
        measures=[MeasureConfirmation(name="mq_pareti", value=15), MeasureConfirmation(name="n_porte", value=2)],
        element_choices=[ChoiceConfirmation(element="sanitari", action="reuse"),
                         ChoiceConfirmation(element="rubinetteria", action="replace")],
    )
    confirmed = confirm(stored, update)

    assert confirmed.measures == [
        StoredMeasure(name="mq", value=6, source="declared"),  # not on the card this time: unchanged
        _confirmed("mq_pareti", 15),  # the proposal accepted: no proposal left
        _confirmed("n_porte", 2),
    ]
    assert confirmed.element_choices == [
        StoredElementChoice(element="sanitari", action="reuse", confirmed=True),
        StoredElementChoice(element="rubinetteria", action="replace", confirmed=True),
    ]
    assert confirmed.missing_measures == [] and confirmed.conflicts == {}


def test_analysis_from_spec_reads_what_expand_needs() -> None:
    spec = _spec(
        [StoredMeasure(name="mq", value=6, source="declared")],
        [StoredElementChoice(element="sanitari", action="keep", confirmed=True)],
    ).model_copy(update={
        "packages": [StoredPackage(assembly_id="ASM-BAGNO-FULL", conditions=["if_doccia"])],
        "extra_items": [StoredExtraItem(sku="SC-002", qty=1)],
        "unmapped_work_requests": ["Vespaio aerato"],
    })
    analysis = analysis_from_spec(spec, "Bagno")

    assert analysis.summary == "Bagno"
    assert [(p.assembly_id, p.conditions) for p in analysis.packages] == [("ASM-BAGNO-FULL", ["if_doccia"])]
    assert [(c.element, c.action) for c in analysis.element_choices] == [("sanitari", "keep")]
    assert [(s.sku, s.qty) for s in analysis.suggestions] == [("SC-002", 1)]
    assert analysis.unmapped_work_requests == ["Vespaio aerato"]
    assert analysis.measures == []  # expand reads them from spec_measures
    assert spec_measures(spec) == {"mq": Decimal(6)}


def test_same_confirmations_compares_only_what_the_client_confirmed() -> None:
    a = _spec([_confirmed("mq", 8, proposed=6), StoredMeasure(name="n_porte", value=1, source="photo")])
    b = _spec([_confirmed("mq", 8)])
    assert same_confirmations(a, b)
    assert same_confirmations(None, _spec([StoredMeasure(name="mq", value=6, source="declared")]))
    assert not same_confirmations(b, _spec([_confirmed("mq", 9)]))
    assert not same_confirmations(None, _spec(choices=[StoredElementChoice(element="s", action="keep", confirmed=True)]))
