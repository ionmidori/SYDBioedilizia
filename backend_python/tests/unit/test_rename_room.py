"""The client corrects the room SYD gave to a photo ("non è il soggiorno, è lo studio").

`rename_room` changes a room's name and type in place, so its photos and
brief stay with it. "Generale" is never renamed (it holds the unfiled media),
and two rooms never end up with the same name.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from google.api_core.exceptions import ServiceUnavailable
from src.adk import tools
from src.adk.session_context import ACTIVE_ROOM_STATE_KEY, ROOMS_STATE_KEY, room_index_entry
from src.core.exceptions import RoomNotFoundError
from src.schemas.room import DEFAULT_ROOM_ID, DEFAULT_ROOM_LABEL, RoomSchema, RoomUpdate
from src.tools import room_tools
from src.utils.datetime_utils import utc_now

PROJECT = "proj-1"


def _room(room_id: str, label: str, room_type: str) -> RoomSchema:
    now = utc_now()
    return RoomSchema(room_id=room_id, label=label, room_type=room_type, created_at=now, updated_at=now)


LIVING = _room("r_sogg", "Soggiorno", "soggiorno")
BATH = _room("r_bagno", "Bagno", "bagno")
STUDY = _room("r_sogg", "Studio", "altro")


def _repo(rooms_before, rooms_after=None, update=None) -> MagicMock:
    repo = MagicMock()
    repo.list_rooms = AsyncMock(side_effect=[rooms_before, rooms_after or rooms_before])
    repo.update_room = update if isinstance(update, AsyncMock) else AsyncMock(return_value=update)
    return repo


async def test_rename_changes_name_and_type_in_place():
    repo = _repo([LIVING, BATH], [STUDY, BATH], update=STUDY)
    with patch.object(room_tools, "get_room_repository", return_value=repo):
        result, rooms = await room_tools.rename_room(PROJECT, "r_sogg", "Studio", "studio")
    repo.update_room.assert_awaited_once_with(PROJECT, "r_sogg", RoomUpdate(label="Studio", room_type="altro"))
    assert result["status"] == "success"
    assert (result["room_id"], result["label"], result["room_type"]) == ("r_sogg", "Studio", "altro")
    assert rooms == [STUDY, BATH]


async def test_the_general_room_is_never_renamed():
    general = _room(DEFAULT_ROOM_ID, DEFAULT_ROOM_LABEL, "altro")
    repo = _repo([general, BATH])
    with patch.object(room_tools, "get_room_repository", return_value=repo):
        result, _ = await room_tools.rename_room(PROJECT, DEFAULT_ROOM_ID, "Cucina", "cucina")
    assert result["status"] == "error" and "select_room" in result["message"]
    repo.update_room.assert_not_awaited()


async def test_a_name_used_by_another_room_is_refused():
    repo = _repo([LIVING, BATH])
    with patch.object(room_tools, "get_room_repository", return_value=repo):
        result, _ = await room_tools.rename_room(PROJECT, "r_sogg", "il bagno", "bagno")
    assert result["status"] == "error" and "Bagno" in result["message"]
    repo.update_room.assert_not_awaited()


async def test_the_same_room_can_keep_its_name_and_change_type():
    camera = _room("r_sogg", "Soggiorno", "camera")
    repo = _repo([LIVING], [camera], update=camera)
    with patch.object(room_tools, "get_room_repository", return_value=repo):
        result, _ = await room_tools.rename_room(PROJECT, "r_sogg", "Soggiorno", "camera")
    assert result["status"] == "success" and result["room_type"] == "camera"


@pytest.mark.parametrize("room_id, name", [("../x", "Studio"), ("r_sogg", ""), ("r_sogg", "x" * 61)])
async def test_invalid_id_or_name_is_refused(room_id, name):
    repo = _repo([LIVING])
    with patch.object(room_tools, "get_room_repository", return_value=repo):
        result, rooms = await room_tools.rename_room(PROJECT, room_id, name, "altro")
    assert result["status"] == "error" and rooms == []
    repo.update_room.assert_not_awaited()


@pytest.mark.parametrize("error, text", [
    (RoomNotFoundError(PROJECT, "r_sogg"), "STANZE DEL PROGETTO"),
    (ServiceUnavailable("down"), "Riprova"),
])
async def test_repository_errors_are_returned(error, text):
    repo = _repo([LIVING], update=AsyncMock(side_effect=error))
    with patch.object(room_tools, "get_room_repository", return_value=repo):
        result, rooms = await room_tools.rename_room(PROJECT, "r_sogg", "Studio", "altro")
    assert result["status"] == "error" and text in result["message"] and rooms == []


# ── ADK tool ────────────────────────────────────────────────────────────────

def _ctx(session: str = PROJECT) -> MagicMock:
    ctx = MagicMock()
    ctx.session.id = session
    ctx.user_id = "uid"
    ctx.state = {}
    return ctx


async def test_tool_uses_the_verified_session_and_refreshes_the_room_index():
    ok = {"status": "success", "room_id": "r_sogg", "label": "Studio", "room_type": "altro"}
    ctx = _ctx()
    with patch.object(tools, "is_anonymous_user", new=AsyncMock(return_value=False)), \
         patch.object(tools.room_tools, "rename_room", new=AsyncMock(return_value=(ok, [STUDY, BATH]))) as ren:
        result = await tools.rename_room(
            room_id="r_sogg", name="Studio", room_type="altro", session_id="victim", tool_context=ctx
        )
    ren.assert_awaited_once_with(PROJECT, "r_sogg", "Studio", "altro")
    assert result == ok
    assert ctx.state[ROOMS_STATE_KEY] == [
        room_index_entry("r_sogg", "Studio", "altro"), room_index_entry("r_bagno", "Bagno", "bagno")
    ]
    assert ACTIVE_ROOM_STATE_KEY not in ctx.state


async def test_tool_failure_leaves_the_state_alone():
    ctx = _ctx()
    with patch.object(tools, "is_anonymous_user", new=AsyncMock(return_value=False)), \
         patch.object(tools.room_tools, "rename_room", new=AsyncMock(return_value=({"status": "error"}, []))):
        await tools.rename_room(room_id="r1", name="Studio", room_type="altro", session_id=PROJECT, tool_context=ctx)
    assert ROOMS_STATE_KEY not in ctx.state


async def test_guests_cannot_rename_rooms():
    ctx = _ctx()
    with patch.object(tools, "is_anonymous_user", new=AsyncMock(return_value=True)), \
         patch.object(tools.settings, "ALLOW_AUTH_BYPASS", False), \
         patch.object(tools.room_tools, "rename_room", new=AsyncMock()) as ren:
        result = await tools.rename_room(room_id="r1", name="Studio", room_type="altro", session_id=PROJECT, tool_context=ctx)
    assert result["status"] == "error" and "registrati" in result["message"]
    ren.assert_not_awaited()


def test_router_and_triage_can_rename_rooms():
    from src.adk.agents import syd_orchestrator, triage_agent

    for agent in (syd_orchestrator, triage_agent):
        assert tools.rename_room_adk in agent.tools
