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

    def __init__(
        self, room: RoomSchema | None, history: list[dict[str, Any]], reply: Any = None,
        rooms: list[RoomSchema] | None = None,
    ) -> None:
        self.rooms = MagicMock()
        self.rooms.get_room_versioned = AsyncMock(return_value=(room, VERSION) if room else None)
        self.rooms.update_brief = AsyncMock()
        self.rooms.list_rooms = AsyncMock(return_value=rooms if rooms is not None else [r for r in [room] if r])

        def context(session_id: str, limit: int, room_id: str | None = None) -> list[dict[str, Any]]:
            # Like the repository: a room's query returns only its tagged messages.
            return [m for m in history if room_id is None or m.get("room_id") == room_id][-limit:]

        self.conversations = MagicMock()
        self.conversations.get_context = AsyncMock(side_effect=context)
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
    room_brief._saves.clear()
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

    backend.conversations.get_context.assert_any_await("s1", limit=settings.ROOM_BRIEF_HISTORY_MESSAGES, room_id="r_bagno")
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
    history = [{"id": "m1", "role": "user", "content": "", "attachments": {"images": ["user-uploads/s1/a.jpg"]},
                "room_id": "r_bagno"}]
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


def _typed_room(room_id: str, label: str, room_type: str) -> RoomSchema:
    return RoomSchema(room_id=room_id, label=label, room_type=room_type, created_at=VERSION, updated_at=VERSION)


GENERALE = _typed_room(DEFAULT_ROOM_ID, "Generale", "altro")
BAGNO = _typed_room("r_bagno", "Bagno", "bagno")
# "Il bagno è 8 mq" typed with no room chip.
NO_CHIP_TALK = [
    {"id": "m1", "role": "user", "content": "Il bagno è 2 x 2,5 m, pavimento 5 mq", "room_id": "r_bagno"},
    {"id": "m2", "role": "user", "content": "il bagno è 8 metri quadri"},
    {"id": "m3", "role": "assistant", "content": "Ho aggiornato la proposta."},
    {"id": "m4", "role": "user", "content": "Anche il corridoio: 8 mq di parquet da levigare"},
]


async def test_a_message_without_a_chip_naming_the_room_reaches_its_brief():
    with _Backend(BAGNO, NO_CHIP_TALK, rooms=[GENERALE, BAGNO]) as backend:
        await _run(_turn(room_id="r_bagno"))
    prompt = backend.generate.await_args.kwargs["contents"]
    assert prompt.index("pavimento 5 mq") < prompt.index("il bagno è 8 metri quadri")
    assert "corridoio" not in prompt and "Ho aggiornato" not in prompt


async def test_generale_leaves_out_messages_naming_one_room():
    with _Backend(GENERALE, NO_CHIP_TALK, rooms=[GENERALE, BAGNO]) as backend:
        await _run(_turn(room_id=None))
    prompt = backend.generate.await_args.kwargs["contents"]
    assert "corridoio: 8 mq di parquet" in prompt
    assert "il bagno è 8 metri quadri" not in prompt


async def test_with_two_bathrooms_the_bare_type_stays_in_generale():
    rooms = [GENERALE, BAGNO, _typed_room("r_ospiti", "Bagno ospiti", "bagno")]
    talk = [{"id": "m1", "role": "user", "content": "il bagno è 8 metri quadri"}]
    with _Backend(BAGNO, talk, rooms=rooms) as backend:
        await _run(_turn(room_id="r_bagno"))
    backend.generate.assert_not_awaited()  # neither bathroom's talk
    with _Backend(GENERALE, talk, rooms=rooms) as backend:
        await _run(_turn(room_id=None))
    assert "il bagno è 8 metri quadri" in backend.generate.await_args.kwargs["contents"]


async def test_a_message_sent_from_generale_naming_one_room_is_that_room_s_talk():
    """ "Il bagno è 11 mq" typed in Generale: the bathroom's brief takes it, Generale's does not."""
    talk = [
        {"id": "m1", "role": "user", "content": "Il bagno è 9mq", "room_id": "r_bagno"},
        {"id": "m2", "role": "user", "content": "Il bagno è 11 mq", "room_id": DEFAULT_ROOM_ID},
        {"id": "m3", "role": "user", "content": "rifacciamo il corridoio", "room_id": DEFAULT_ROOM_ID},
    ]
    with _Backend(BAGNO, talk, rooms=[GENERALE, BAGNO]) as backend:
        await _run(_turn(room_id="r_bagno"))
    prompt = backend.generate.await_args.kwargs["contents"]
    assert prompt.index("Il bagno è 9mq") < prompt.index("Il bagno è 11 mq")
    assert "corridoio" not in prompt
    with _Backend(GENERALE, talk, rooms=[GENERALE, BAGNO]) as backend:
        await _run(_turn(room_id=None))
    prompt = backend.generate.await_args.kwargs["contents"]
    assert "corridoio" in prompt and "11 mq" not in prompt


async def test_a_message_sent_from_a_room_naming_another_room_is_the_other_room_s_talk():
    cucina = _typed_room("r_cucina", "Cucina", "cucina")
    talk = [
        {"id": "m1", "role": "user", "content": "doccia al posto della vasca", "room_id": "r_bagno"},
        {"id": "m2", "role": "user", "content": "in cucina il top in quarzo", "room_id": "r_bagno"},
    ]
    with _Backend(cucina, talk, rooms=[GENERALE, BAGNO, cucina]) as backend:
        await _run(_turn(room_id="r_cucina"))
    prompt = backend.generate.await_args.kwargs["contents"]
    assert "top in quarzo" in prompt and "doccia" not in prompt
    with _Backend(BAGNO, talk, rooms=[GENERALE, BAGNO, cucina]) as backend:
        await _run(_turn(room_id="r_bagno"))
    prompt = backend.generate.await_args.kwargs["contents"]
    assert "doccia" in prompt and "top in quarzo" not in prompt


async def test_a_watermark_on_a_message_now_named_elsewhere_reads_only_what_follows():
    """Generale summarized "il bagno è 8 mq" before the bathroom existed; once the room
    exists that message leaves Generale's talk, and the next refresh must not re-read
    everything from the start."""
    talk = [
        {"id": "m1", "role": "user", "content": "scaldabagno a gas da sostituire"},
        {"id": "m2", "role": "user", "content": "il bagno è 8 metri quadri"},
    ]
    with _Backend(GENERALE, talk, rooms=[GENERALE]) as backend:
        await _run(_turn(room_id=None))
    assert room_brief._watermark[("s1", DEFAULT_ROOM_ID)] == "m2"
    later = [*talk, {"id": "m5", "role": "user", "content": "corridoio: 8 mq di parquet"}]
    with _Backend(GENERALE, later, rooms=[GENERALE, BAGNO]) as backend:
        await _run(_turn(room_id=None))
    prompt = backend.generate.await_args.kwargs["contents"]
    assert "corridoio" in prompt and "scaldabagno" not in prompt


async def test_a_room_s_old_tagged_messages_outside_the_recent_window_still_count(monkeypatch):
    monkeypatch.setattr(settings, "ROOM_BRIEF_HISTORY_MESSAGES", 2)
    talk = [
        {"id": "m1", "role": "user", "content": "Bagno: doccia walk-in", "room_id": "r_bagno"},
        *({"id": f"x{i}", "role": "user", "content": f"corridoio nota {i}"} for i in range(6)),
        {"id": "m9", "role": "user", "content": "il bagno è 8 metri quadri"},
    ]
    with _Backend(BAGNO, talk, rooms=[GENERALE, BAGNO]) as backend:
        await _run(_turn(room_id="r_bagno"))
    prompt = backend.generate.await_args.kwargs["contents"]
    assert prompt.index("doccia walk-in") < prompt.index("il bagno è 8 metri quadri")


async def test_an_old_room_message_naming_another_room_outside_the_window_stays_with_its_room(monkeypatch):
    """The named room reads only the recent window: an older message it cannot see stays where it was typed."""
    monkeypatch.setattr(settings, "ROOM_BRIEF_HISTORY_MESSAGES", 2)
    cucina = _typed_room("r_cucina", "Cucina", "cucina")
    talk = [
        {"id": "m1", "role": "user", "content": "in cucina il top in quarzo", "room_id": "r_bagno"},
        *({"id": f"x{i}", "role": "user", "content": f"corridoio nota {i}"} for i in range(6)),
        {"id": "m9", "role": "user", "content": "doccia walk-in", "room_id": "r_bagno"},
    ]
    with _Backend(BAGNO, talk, rooms=[GENERALE, BAGNO, cucina]) as backend:
        await _run(_turn(room_id="r_bagno"))
    assert "top in quarzo" in backend.generate.await_args.kwargs["contents"]


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


async def test_the_refresh_waits_for_the_user_message_of_the_turn():
    """The turn ends before its user message is in Firestore: the refresh reads the
    chat only once it is, so "il bagno è 9 mq" reaches the brief (and is not left
    behind the watermark, which moves to the reply after it)."""
    history = [{"id": "m2", "role": "assistant", "content": "Annotato.", "room_id": "r_bagno"}]
    saved = asyncio.get_running_loop().create_future()
    with _Backend(_room(), history) as backend:
        task = schedule_room_brief_refresh(
            BriefTurn(project_id="p1", session_id="s1", room_id="r_bagno", is_guest=False, user_message_saved=saved)
        )
        assert task is not None
        # Long enough for a refresh that does not wait to read the chat and finish.
        done, _ = await asyncio.wait({task}, timeout=0.2)
        assert not done
        backend.conversations.get_context.assert_not_awaited()
        history.insert(0, {"id": "m1", "role": "user", "content": "Il bagno è 9 mq", "room_id": "r_bagno"})
        saved.set_result(None)
        await task
    prompt = backend.generate.await_args.kwargs["contents"]
    assert "Il bagno è 9 mq" in prompt
    assert room_brief._watermark[("s1", "r_bagno")] == "m2"


async def test_a_failed_user_message_save_still_refreshes_the_brief():
    saved = asyncio.get_running_loop().create_future()
    saved.set_exception(RuntimeError("firestore down"))
    with _Backend(_room(), BATH_TALK) as backend:
        await _run(BriefTurn(project_id="p1", session_id="s1", room_id="r_bagno", is_guest=False, user_message_saved=saved))
    backend.generate.assert_awaited_once()
    assert isinstance(saved.exception(), RuntimeError)


async def test_a_save_that_never_ends_holds_the_refresh_only_for_a_while(monkeypatch):
    monkeypatch.setattr(settings, "ROOM_BRIEF_TIMEOUT_SECONDS", 0.05)
    never = asyncio.get_running_loop().create_future()
    with _Backend(_room(), BATH_TALK) as backend:
        await asyncio.wait_for(
            _run(BriefTurn(project_id="p1", session_id="s1", room_id="r_bagno", is_guest=False, user_message_saved=never)),
            timeout=1,
        )
    backend.generate.assert_awaited_once()
    assert not room_brief._saves


async def test_a_turn_ending_during_a_refresh_is_read_after_its_own_user_message():
    """The running refresh goes again for the second turn, and waits for that
    turn's user message too, not only the first one's."""
    release = asyncio.Event()
    summarizing = asyncio.Event()

    async def slow_reply(**_: Any) -> SimpleNamespace:
        summarizing.set()
        await release.wait()
        return _reply()

    history = list(BATH_TALK)
    second_saved = asyncio.get_running_loop().create_future()
    with _Backend(_room(), history) as backend:
        backend.generate.side_effect = slow_reply
        first = schedule_room_brief_refresh(_turn())
        await asyncio.wait_for(summarizing.wait(), timeout=1)
        history.append({"id": "m4", "role": "assistant", "content": "Va bene.", "room_id": "r_bagno"})
        assert schedule_room_brief_refresh(
            BriefTurn(project_id="p1", session_id="s1", room_id="r_bagno", is_guest=False, user_message_saved=second_saved)
        ) is None
        release.set()
        assert first is not None
        done, _ = await asyncio.wait({first}, timeout=0.2)
        assert not done
        history.insert(2, {"id": "m3", "role": "user", "content": "Il bagno è 9 mq", "room_id": "r_bagno"})
        second_saved.set_result(None)
        await first
    assert "Il bagno è 9 mq" in backend.generate.await_args.kwargs["contents"]
