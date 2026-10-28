"""
Room brief kept up to date in the background (Phase 138 PR-5): only when the
room has new facts, never more than one refresh per room at a time, and never
an error that reaches the reply.
"""
import asyncio
import json
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from google.api_core.exceptions import FailedPrecondition, ServiceUnavailable
from google.genai import _transformers as genai_transformers
from google.genai import errors as genai_errors
from src.core.config import settings
from src.schemas.room import DEFAULT_ROOM_ID, RoomBrief, RoomSchema
from src.services import room_brief
from src.services.room_brief import BriefTurn, _BriefUpdate, schedule_room_brief_refresh

VERSION = datetime(2026, 10, 28, 12, 0, tzinfo=UTC)


def _room(room_id: str = "r_bagno", label: str = "Bagno", brief: RoomBrief | None = None, summary: str | None = None) -> RoomSchema:
    return RoomSchema(
        room_id=room_id, label=label, room_type="bagno" if room_id == "r_bagno" else "altro",
        created_at=VERSION, updated_at=VERSION, brief=brief or RoomBrief(), summary=summary,
    )


def _reply(changed: bool = True, **brief: Any) -> SimpleNamespace:
    payload = {"changed": changed, "brief": {"floor_mq": 5.0, **brief}, "summary": "Bagno 5 mq, doccia walk-in"}
    return SimpleNamespace(text=json.dumps(payload))


class _Backend:
    """Rooms, chat history and summarizer model of one test."""

    def __init__(self, room: RoomSchema | None, history: list[dict[str, Any]], reply: Any = None) -> None:
        self.rooms = MagicMock()
        self.rooms.get_room_versioned = AsyncMock(return_value=(room, VERSION) if room else None)
        self.rooms.update_brief = AsyncMock()
        self.conversations = MagicMock()
        self.conversations.get_context = AsyncMock(return_value=history)
        self.generate = AsyncMock(return_value=reply if reply is not None else _reply())
        client = MagicMock()
        client.aio.models.generate_content = self.generate
        self._patches = [
            patch.object(room_brief, "get_room_repository", return_value=self.rooms),
            patch.object(room_brief, "get_conversation_repository", return_value=self.conversations),
            patch.object(room_brief, "get_genai_client", return_value=client),
        ]

    def __enter__(self) -> "_Backend":
        for p in self._patches:
            p.start()
        return self

    def __exit__(self, *exc: object) -> None:
        for p in self._patches:
            p.stop()


@pytest.fixture(autouse=True)
def _clean_state(monkeypatch):
    monkeypatch.setattr(settings, "ROOM_BRIEF_ENABLED", True)
    room_brief._watermark.clear()
    room_brief._running.clear()
    room_brief._dirty.clear()
    yield


def _turn(room_id: str | None = "r_bagno", is_guest: bool = False) -> BriefTurn:
    return BriefTurn(project_id="p1", session_id="s1", room_id=room_id, is_guest=is_guest)


async def _run(turn: BriefTurn) -> None:
    task = schedule_room_brief_refresh(turn)
    assert task is not None
    await task


BATH_TALK = [
    {"id": "m1", "role": "user", "content": "Il bagno è 2 x 2,5 m, pavimento 5 mq", "room_id": "r_bagno"},
    {"id": "m2", "role": "assistant", "content": "Annotato.", "room_id": "r_bagno"},
]


def test_brief_update_converts_to_a_genai_schema():
    """Same regression as the InsightEngine: no extra="forbid", no exclusive bounds."""
    schema = genai_transformers.t_schema(None, _BriefUpdate)
    assert "additional_properties" not in json.dumps(schema.model_dump(exclude_none=True))


def test_guests_and_disabled_flag_start_nothing(monkeypatch):
    assert schedule_room_brief_refresh(_turn(is_guest=True)) is None
    monkeypatch.setattr(settings, "ROOM_BRIEF_ENABLED", False)
    assert schedule_room_brief_refresh(_turn()) is None


async def test_new_facts_update_the_brief_with_a_precondition():
    with _Backend(_room(), BATH_TALK) as backend:
        await _run(_turn())

    backend.conversations.get_context.assert_awaited_once_with("s1", limit=settings.ROOM_BRIEF_HISTORY_MESSAGES, room_id="r_bagno")
    prompt = backend.generate.await_args.kwargs["contents"]
    assert "Il bagno è 2 x 2,5 m, pavimento 5 mq" in prompt and 'stanza "Bagno"' in prompt
    backend.rooms.update_brief.assert_awaited_once()
    args = backend.rooms.update_brief.await_args
    assert args.args == ("p1", "r_bagno")
    assert args.kwargs["brief"].floor_mq == 5.0
    assert args.kwargs["summary"] == "Bagno 5 mq, doccia walk-in"
    assert args.kwargs["expected_update_time"] == VERSION
    assert room_brief._watermark[("s1", "r_bagno")] == "m2"


async def test_nothing_new_since_the_last_refresh_skips_the_model():
    with _Backend(_room(), BATH_TALK) as backend:
        await _run(_turn())
        await _run(_turn())
    assert backend.generate.await_count == 1


@pytest.mark.parametrize("text", ["ok", "Sì!", "grazie mille", "va bene", "  procedi "])
async def test_acknowledgements_are_not_new_facts(text):
    history = [{"id": "m1", "role": "user", "content": text}, {"id": "m2", "role": "assistant", "content": "Bene."}]
    with _Backend(_room(), history) as backend:
        await _run(_turn())
    backend.generate.assert_not_awaited()


async def test_an_attachment_is_a_new_fact():
    history = [{"id": "m1", "role": "user", "content": "", "attachments": {"images": ["user-uploads/s1/a.jpg"]}}]
    with _Backend(_room(), history) as backend:
        await _run(_turn())
    backend.generate.assert_awaited_once()
    assert "[con allegati]" in backend.generate.await_args.kwargs["contents"]


async def test_model_saying_nothing_changed_writes_nothing():
    with _Backend(_room(), BATH_TALK, reply=_reply(changed=False)) as backend:
        await _run(_turn())
    backend.rooms.update_brief.assert_not_awaited()
    assert room_brief._watermark[("s1", "r_bagno")] == "m2"


async def test_same_brief_as_stored_writes_nothing():
    stored = _room(brief=RoomBrief(floor_mq=5.0), summary="Bagno 5 mq, doccia walk-in")
    with _Backend(stored, BATH_TALK) as backend:
        await _run(_turn())
    backend.rooms.update_brief.assert_not_awaited()


@pytest.mark.parametrize(
    ("failure", "outcome"),
    [
        (genai_errors.ServerError(503, {"error": {"message": "x"}}), "error:ServerError"),
        (ServiceUnavailable("firestore down"), "error:ServiceUnavailable"),
    ],
)
async def test_model_or_firestore_errors_are_logged_never_raised(failure, outcome, caplog):
    with _Backend(_room(), BATH_TALK) as backend:
        backend.generate.side_effect = failure
        with caplog.at_level("WARNING"):
            await _run(_turn())
    assert any(getattr(r, "outcome", None) == outcome for r in caplog.records)
    # Not summarized: the next turn tries again.
    assert ("s1", "r_bagno") not in room_brief._watermark


async def test_invalid_model_output_is_logged_never_raised(caplog):
    with _Backend(_room(), BATH_TALK, reply=SimpleNamespace(text="non è json")) as backend:
        with caplog.at_level("WARNING"):
            await _run(_turn())
    backend.rooms.update_brief.assert_not_awaited()
    assert any(getattr(r, "outcome", None) == "error:ValidationError" for r in caplog.records)


async def test_room_changed_meanwhile_is_a_conflict(caplog):
    with _Backend(_room(), BATH_TALK) as backend:
        backend.rooms.update_brief.side_effect = FailedPrecondition("update_time mismatch")
        with caplog.at_level("WARNING"):
            await _run(_turn())
    assert any(getattr(r, "outcome", None) == "conflict" for r in caplog.records)


async def test_slow_model_is_cut_by_the_deadline(monkeypatch, caplog):
    monkeypatch.setattr(settings, "ROOM_BRIEF_TIMEOUT_SECONDS", 0.05)

    async def hang(**_: Any) -> None:
        await asyncio.sleep(10)

    with _Backend(_room(), BATH_TALK) as backend:
        backend.generate.side_effect = hang
        with caplog.at_level("WARNING"):
            await _run(_turn())
    assert any(getattr(r, "outcome", None) == "timeout" for r in caplog.records)


async def test_turn_without_room_refreshes_generale_from_project_wide_talk():
    history = [
        {"id": "m1", "role": "user", "content": "Il bagno è 2 x 2,5 m", "room_id": "r_bagno"},
        {"id": "m2", "role": "user", "content": "Anche il corridoio: 8 mq di parquet da levigare"},
        {"id": "m3", "role": "assistant", "content": "Annotato.", "room_id": DEFAULT_ROOM_ID},
    ]
    with _Backend(_room(DEFAULT_ROOM_ID, "Generale"), history) as backend:
        await _run(_turn(room_id=None))

    backend.rooms.get_room_versioned.assert_awaited_once_with("p1", DEFAULT_ROOM_ID)
    prompt = backend.generate.await_args.kwargs["contents"]
    assert "corridoio: 8 mq di parquet" in prompt
    assert "Il bagno è 2 x 2,5 m" not in prompt  # a created room's fact stays with that room
    assert "stanza non creata" in prompt
    backend.rooms.update_brief.assert_awaited_once()


async def test_missing_room_skips_the_model():
    """No "Generale" room in the project: nothing is created (no new chip in the client)."""
    with _Backend(None, BATH_TALK) as backend:
        await _run(_turn(room_id=None))
    backend.generate.assert_not_awaited()
    backend.rooms.update_brief.assert_not_awaited()


async def test_turn_ending_during_a_refresh_is_summarized_after_it():
    release = asyncio.Event()
    summarizing = asyncio.Event()
    calls = 0

    async def slow_reply(**_: Any) -> SimpleNamespace:
        nonlocal calls
        calls += 1
        summarizing.set()
        await release.wait()
        return _reply(decisions=[f"decisione {calls}"])

    history = list(BATH_TALK)
    with _Backend(_room(), history) as backend:
        backend.generate.side_effect = slow_reply
        first = schedule_room_brief_refresh(_turn())
        await asyncio.wait_for(summarizing.wait(), timeout=1)
        history.append({"id": "m3", "role": "user", "content": "Metto anche un termoarredo", "room_id": "r_bagno"})
        # The room is being summarized: no second task, the running one goes again.
        assert schedule_room_brief_refresh(_turn()) is None
        release.set()
        assert first is not None
        await first

    assert backend.generate.await_count == 2
    assert room_brief._watermark[("s1", "r_bagno")] == "m3"
    assert ("s1", "r_bagno") not in room_brief._running


async def test_brief_past_the_limits_is_fitted_not_frozen():
    """An overlong answer is cut to RoomBrief's limits: the refresh still writes
    and moves on, instead of failing on every later turn."""
    reply = _reply(
        floor_mq=-3, height_m=95, surfaces="x" * 1500,
        decisions=[f"decisione {i}" for i in range(25)] + ["d" * 400],
    )
    with _Backend(_room(), BATH_TALK, reply=reply) as backend:
        await _run(_turn())
    brief = backend.rooms.update_brief.await_args.kwargs["brief"]
    assert brief.floor_mq is None and brief.height_m is None
    assert brief.surfaces is not None and len(brief.surfaces) == 1000
    assert len(brief.decisions) == 20
    assert room_brief._watermark[("s1", "r_bagno")] == "m2"


def test_watermarks_are_bounded(monkeypatch):
    monkeypatch.setattr(room_brief, "_WATERMARK_MAX", 2)
    for i in range(3):
        room_brief._remember((f"s{i}", "r"), f"m{i}")
    assert list(room_brief._watermark) == [("s1", "r"), ("s2", "r")]


async def test_turn_ending_right_after_a_refresh_starts_a_new_one():
    """The finished refresh no longer counts as running: the next turn's facts
    get their own refresh instead of a dirty mark nobody reads."""
    history = list(BATH_TALK)
    with _Backend(_room(), history) as backend:
        await _run(_turn())
        history.append({"id": "m3", "role": "user", "content": "Metto anche un termoarredo", "room_id": "r_bagno"})
        second = schedule_room_brief_refresh(_turn())
        assert second is not None
        await second
    assert backend.generate.await_count == 2
    assert not room_brief._dirty and not room_brief._running
