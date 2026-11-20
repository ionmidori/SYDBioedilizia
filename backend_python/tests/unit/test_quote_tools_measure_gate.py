"""Phase 140: MeasureRoom (a model call that reads the room's photo) runs only when the
room's measures are not already given by the client: the quote is not made to wait for
a photo estimate nobody needs, and the client is not asked twice for a value."""
from datetime import UTC, datetime

import pytest
from src.schemas.intervention_spec import RoomInterventionSpec, StoredMeasure, StoredMeasureSource
from src.schemas.room import RoomBrief, RoomSchema
from src.utils.datetime_utils import utc_now
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
