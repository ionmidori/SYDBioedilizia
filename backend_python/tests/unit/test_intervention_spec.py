"""Phase 140 step 1, Task 5: the intervention spec stored on the room, apart from
the brief, and built from the model's analysis with the measures actually used."""
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError
from src.schemas.intervention_spec import RoomInterventionSpec, StoredMeasure
from src.schemas.room import RoomBrief, RoomSchema
from src.services.insight_engine import (
    ElementChoice,
    InsightAnalysis,
    PackageChoice,
    SKUItemSuggestion,
    SpecMeasure,
)
from src.services.intervention_expansion import resolve_measures, spec_from_analysis

T0 = datetime(2026, 11, 10, 9, 30, tzinfo=UTC)

_ROOM_DOC = {
    "room_id": "bagno1",
    "label": "Bagno",
    "room_type": "bagno",
    "created_at": T0,
    "updated_at": T0,
    "brief": {"floor_mq": 5.0},
    "reference_photo_id": None,
    "summary": "Bagno 5 mq",
}


def _analysis() -> InsightAnalysis:
    return InsightAnalysis(
        summary="Bagno da rifare, sanitari tenuti",
        packages=[PackageChoice(assembly_id="ASM-BAGNO-FULL", conditions=["if_vasca"], reasoning="bagno anni '80")],
        measures=[
            SpecMeasure(name="mq", value=6, source="declared"),
            # 0 is the model's "unknown": not a measure, not stored.
            SpecMeasure(name="n_finestre", value=0, source="estimated"),
        ],
        element_choices=[ElementChoice(element="sanitari", action="keep")],
        suggestions=[SKUItemSuggestion(sku="IMP-ID-003", qty=1, ai_reasoning="attacco lavatrice")],
        unmapped_work_requests=["Vespaio aerato sotto il pavimento"],
    )


def _spec() -> RoomInterventionSpec:
    analysis = _analysis()
    measures = resolve_measures(analysis, RoomBrief(floor_mq=5.0, walls_mq=14.5))
    return spec_from_analysis(analysis, measures, library_version="2.1.0", now=T0)


def test_old_room_documents_still_validate() -> None:
    room = RoomSchema.model_validate(_ROOM_DOC)
    assert room.intervention_spec is None


def test_spec_from_analysis_keeps_what_was_used_and_where_it_came_from() -> None:
    spec = _spec()
    # The spec's mq (6, declared) wins over the brief's floor (5); the walls come from the brief.
    assert spec.measures == [
        StoredMeasure(name="mq", value=6.0, source="declared"),
        StoredMeasure(name="mq_pareti", value=14.5, source="brief"),
    ]
    assert [(p.assembly_id, p.conditions) for p in spec.packages] == [("ASM-BAGNO-FULL", ["if_vasca"])]
    assert [(e.element, e.action) for e in spec.element_choices] == [("sanitari", "keep")]
    assert [(x.sku, x.qty) for x in spec.extra_items] == [("IMP-ID-003", 1.0)]
    assert spec.unmapped_work_requests == ["Vespaio aerato sotto il pavimento"]
    assert spec.library_version == "2.1.0" and spec.generated_at == T0


def test_spec_round_trips_through_the_room_document() -> None:
    spec = _spec()
    room = RoomSchema.model_validate({**_ROOM_DOC, "intervention_spec": spec.model_dump()})
    assert room.intervention_spec == spec


def test_stored_spec_rejects_unknown_fields() -> None:
    data = _spec().model_dump()
    data["packages"][0]["reasoning"] = "not stored"
    with pytest.raises(ValidationError):
        RoomInterventionSpec.model_validate(data)


def test_room_serialization_leaves_the_spec_out() -> None:
    """Backend-only until the confirmation widgets (step 3): the zod `roomSchema`
    of the client is strict, so the field never leaves the backend with the room."""
    room = RoomSchema.model_validate({**_ROOM_DOC, "intervention_spec": _spec().model_dump()})
    assert room.intervention_spec is not None
    assert "intervention_spec" not in room.model_dump()
    assert "intervention_spec" not in room.model_dump_json()


def test_step3_fields_default_for_specs_stored_before_them() -> None:
    """Phase 140 step 3: a spec saved by step 1 still reads, with the new fields empty."""
    spec = RoomInterventionSpec.model_validate(_spec().model_dump(exclude={"missing_measures", "conflicts"}))
    assert spec.missing_measures == [] and spec.conflicts == {}
    assert all(m.proposed is None for m in spec.measures)
    assert all(not c.confirmed for c in spec.element_choices)


def test_confirmed_source_and_confirmation_marks_are_stored() -> None:
    spec = RoomInterventionSpec.model_validate({
        **_spec().model_dump(),
        "measures": [{"name": "mq", "value": 8.0, "source": "confirmed", "proposed": 6.0}],
        "element_choices": [{"element": "sanitari", "action": "replace", "confirmed": True}],
        "missing_measures": ["mq_pareti"],
        "conflicts": {"ml_perimetro": [9.0, 12.0]},
    })
    assert spec.measures == [StoredMeasure(name="mq", value=8.0, source="confirmed", proposed=6.0)]
    assert spec.element_choices[0].confirmed is True
    assert spec.missing_measures == ["mq_pareti"] and spec.conflicts == {"ml_perimetro": [9.0, 12.0]}


def test_proposed_measure_has_the_measure_bounds() -> None:
    assert StoredMeasure(name="mq", value=8.0, source="confirmed", proposed=10_000).proposed == 10_000
    with pytest.raises(ValidationError):
        StoredMeasure(name="mq", value=8.0, source="confirmed", proposed=10_001)
