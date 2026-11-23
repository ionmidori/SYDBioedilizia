"""Phase 140: MeasureRoom (a model call that reads the room's photo) runs only when the
room's measures are not already given by the client: the quote is not made to wait for
a photo estimate nobody needs, and the client is not asked twice for a value."""
import hashlib
from datetime import UTC, datetime

import pytest
from src.schemas.intervention_spec import RoomInterventionSpec, StoredMeasure, StoredMeasureSource
from src.schemas.room import PhotoEstimate, RoomBrief, RoomSchema
from src.utils.datetime_utils import utc_now
from src.vision.measure_room import RoomMeasurements
from tests.unit.test_room_quote import ANALYSES, FILES, HISTORY, _project, _quote

NOW = datetime(2026, 11, 20, tzinfo=UTC)


def _bagno(brief: RoomBrief | None = None, spec: RoomInterventionSpec | None = None) -> RoomSchema:
    now = utc_now()
    return RoomSchema(
        room_id="bagno1", label="Bagno", room_type="bagno", created_at=now, updated_at=now,
        reference_photo_id="f_bagno_old", brief=brief or RoomBrief(), intervention_spec=spec,
    )


def _spec(*measures: tuple[str, StoredMeasureSource], missing: tuple[str, ...] = ()) -> RoomInterventionSpec:
    return RoomInterventionSpec(
        measures=[StoredMeasure(name=name, value=6, source=source) for name, source in measures],
        missing_measures=list(missing), library_version="2.1.0", generated_at=NOW,
    )


async def _measured_rooms(room: RoomSchema) -> int:
    """How many times the photo was measured for the bathroom of a chat with only that room."""
    rooms = [room]
    history = [m for m in HISTORY if m.get("room_id") == "bagno1"]
    files = [f for f in FILES if f["roomId"] == "bagno1"]
    with _project(rooms=rooms, files=files, history=history, analyses={"Bagno": ANALYSES["Bagno"]}) as mocks:
        await _quote()
    return mocks["measure"].await_count


async def test_a_room_whose_measures_the_client_gave_is_not_measured() -> None:
    spec = _spec(("mq", "declared"), ("mq_pareti", "declared"))
    assert await _measured_rooms(_bagno(spec=spec)) == 0


async def test_a_confirmed_measure_counts_as_given() -> None:
    assert await _measured_rooms(_bagno(spec=_spec(("mq", "confirmed")))) == 0


async def test_a_room_still_missing_a_measure_is_measured() -> None:
    spec = _spec(("mq", "declared"), missing=("mq_pareti",))
    assert await _measured_rooms(_bagno(spec=spec)) == 1


@pytest.mark.parametrize("source", ["photo", "estimated"])
async def test_measures_read_from_a_photo_are_not_the_clients(source: StoredMeasureSource) -> None:
    assert await _measured_rooms(_bagno(spec=_spec(("mq", source), ("mq_pareti", source)))) == 1


async def test_dimensions_on_the_brief_cover_the_main_measures_without_a_spec() -> None:
    assert await _measured_rooms(_bagno(brief=RoomBrief(length_m=4, width_m=5))) == 0


async def test_a_floor_alone_on_the_brief_does_not_cover_the_walls() -> None:
    assert await _measured_rooms(_bagno(brief=RoomBrief(floor_mq=6))) == 1


async def test_a_room_without_measures_is_measured() -> None:
    assert await _measured_rooms(_bagno()) == 1


async def test_the_spec_stored_by_the_quote_tells_the_calculated_measures() -> None:
    room = _bagno(brief=RoomBrief(length_m=4, width_m=5))
    history = [m for m in HISTORY if m.get("room_id") == "bagno1"]
    files = [f for f in FILES if f["roomId"] == "bagno1"]
    with _project(rooms=[room], files=files, history=history, analyses={"Bagno": ANALYSES["Bagno"]}) as mocks:
        await _quote()
    stored = mocks["store"].written["bagno1"]
    assert {m.name: m.source for m in stored.measures}["mq"] == "calculated"


async def _warnings_for(brief: RoomBrief) -> list[str]:
    room = _bagno(brief=brief)
    history = [m for m in HISTORY if m.get("room_id") == "bagno1"]
    files = [f for f in FILES if f["roomId"] == "bagno1"]
    with _project(rooms=[room], files=files, history=history, analyses={"Bagno": ANALYSES["Bagno"]}) as mocks:
        await _quote()
    request = mocks["saved"].await_args.args[3]
    return [w.message for w in request.ai_warnings if w.kind == "admin_check" and w.room_id == "bagno1"]


async def test_calculated_walls_and_an_assumed_height_are_told_to_the_team() -> None:
    messages = await _warnings_for(RoomBrief(length_m=4, width_m=5))
    assert any("lorde" in m and "porte e finestre" in m for m in messages)
    assert any("altezza" in m.lower() and "2,70" in m for m in messages)


async def test_a_given_height_is_not_an_assumption() -> None:
    messages = await _warnings_for(RoomBrief(length_m=4, width_m=5, height_m=3))
    assert any("lorde" in m for m in messages)
    assert not any("altezza" in m.lower() and "2,70" in m for m in messages)


async def test_no_calculation_no_note() -> None:
    assert await _warnings_for(RoomBrief(floor_mq=6, walls_mq=20)) == []


def _stored_estimate() -> PhotoEstimate:
    return PhotoEstimate(
        source_hash="a" * 64, reference_hash=hashlib.sha256(b"photo").hexdigest(), at=utc_now(),
        measurements=RoomMeasurements(
            room_type="bagno", estimated_floor_mq=5.5, estimated_walls_mq=21.0,
            estimated_ceiling_mq=5.5, estimated_perimeter_ml=9.0,
        ),
    )


async def _context_of(room: RoomSchema) -> str:
    history = [m for m in HISTORY if m.get("room_id") == "bagno1"]
    files = [f for f in FILES if f["roomId"] == "bagno1"]
    with _project(rooms=[room], files=files, history=history, analyses={"Bagno": ANALYSES["Bagno"]}) as mocks:
        await _quote()
    return mocks["analyze"].await_args.args[0][0]["content"]


async def test_skipping_the_measurement_still_gives_the_model_the_stored_photo_estimate() -> None:
    """A skipped model call must not hide what the photos already gave (walls, windows)."""
    room = _bagno(spec=_spec(("mq", "declared")))
    room = room.model_copy(update={"photo_estimate": _stored_estimate()})
    context = await _context_of(room)
    assert "21.0" in context  # the stored estimate's walls


async def test_the_quote_model_is_not_given_the_dimensions_to_calculate_with() -> None:
    """The code derives floor, perimeter and walls: the model's own arithmetic would outrank it."""
    context = await _context_of(_bagno(brief=RoomBrief(length_m=4, width_m=5, height_m=3, floor_mq=None)))
    assert "Lunghezza" not in context and "Larghezza" not in context


async def test_the_calculated_notes_are_kept_on_the_spec_for_the_card_recalculation() -> None:
    room = _bagno(brief=RoomBrief(length_m=4, width_m=5))
    history = [m for m in HISTORY if m.get("room_id") == "bagno1"]
    files = [f for f in FILES if f["roomId"] == "bagno1"]
    with _project(rooms=[room], files=files, history=history, analyses={"Bagno": ANALYSES["Bagno"]}) as mocks:
        await _quote()
    checks = mocks["store"].written["bagno1"].admin_checks
    assert any(c.measure == "mq_pareti" and "lorde" in c.message for c in checks)


async def test_no_calculated_note_once_the_client_confirmed_the_walls() -> None:
    from_card = _spec(("mq_pareti", "confirmed"))
    room = _bagno(brief=RoomBrief(length_m=4, width_m=5), spec=from_card)
    history = [m for m in HISTORY if m.get("room_id") == "bagno1"]
    files = [f for f in FILES if f["roomId"] == "bagno1"]
    with _project(
        rooms=[room], files=files, history=history, analyses={"Bagno": ANALYSES["Bagno"]}, specs={"bagno1": from_card}
    ) as mocks:
        await _quote()
    request = mocks["saved"].await_args.args[3]
    assert not [w for w in request.ai_warnings if "lorde" in w.message]
    assert not [c for c in mocks["store"].written["bagno1"].admin_checks if "lorde" in c.message]


async def test_the_old_spec_of_a_cleared_room_does_not_skip_the_measurement() -> None:
    """Review finding (PR 3): what the client confirmed before the clear no longer counts."""
    room = _bagno(spec=_spec(("mq", "confirmed"), ("mq_pareti", "confirmed"))).model_copy(update={"cleared_at": NOW})
    assert await _measured_rooms(room) == 1
