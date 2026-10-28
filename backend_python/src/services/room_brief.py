"""
Room brief ("scheda stanza") kept up to date in the background (Phase 138 PR-5).

After a chat turn the orchestrator calls `schedule_room_brief_refresh`: it
returns at once and, when the turn's room has new facts, a background task asks
the summarizer model (`ModelRole.SUMMARIZER`) for the updated brief and writes
it to `projects/{project_id}/rooms/{room_id}`. The reply never waits for it and
never sees its errors.

Debounce, cheapest check first:
1. logged-in users only, `ROOM_BRIEF_ENABLED`;
2. the room's messages newer than the last summarized one (process-local
   watermark, like the in-memory ADK sessions: after a restart the next refresh
   reads the room's recent messages again) must include a user message with
   substance (not just "ok" / "sì" / "grazie") or an attachment;
3. the model says whether anything changed, and the brief is written only when
   it differs from the stored one.
One refresh per room at a time: a turn that ends while its room is being
summarized marks it dirty and the running task summarizes again.

"Generale" (DEFAULT_ROOM_ID) is the brief of the whole home and of the rooms
the client mentioned but never created; it is refreshed for turns without an
active room, only in a project that already has its "Generale" room (no new
room chip appears in the client because of this task).
"""
import asyncio
import json
import logging
import re
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any

import httpx
from google.api_core.exceptions import FailedPrecondition, GoogleAPIError
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import BaseModel, Field, ValidationError

from src.adk.background import run_in_background
from src.core.config import settings
from src.core.models import ModelRole, build_thinking_config, get_genai_client, get_model_id
from src.prompts.components.room_brief import GENERAL_SCOPE, ROOM_BRIEF_PROMPT, ROOM_SCOPE
from src.repositories.conversation_repository import get_conversation_repository
from src.repositories.room_repository import get_room_repository
from src.schemas.room import DEFAULT_ROOM_ID, RoomBrief, RoomSchema

logger = logging.getLogger(__name__)

# Replies that carry no fact about the room.
_TRIVIAL = re.compile(
    r"^\W*(ok(ay)?|s[iì]|no|grazie( mille)?|perfetto|va bene|certo|procedi|vai|d'accordo|esatto|giusto)\W*$",
    re.IGNORECASE,
)
_MESSAGE_MAX_CHARS = 1500
# Project-wide talk has no room tag to query by: it is picked from a wider window of the chat.
_GENERAL_WINDOW_FACTOR = 3
# Rooms remembered by one instance (oldest forgotten first: they are only summarized again).
_WATERMARK_MAX = 4096

_Key = tuple[str, str]  # (session_id, room_id)
# Id of the newest message already summarized, per room, least recently used first.
_watermark: OrderedDict[_Key, str] = OrderedDict()
# Rooms being summarized, and those that got new turns meanwhile.
_running: dict[_Key, asyncio.Task[None]] = {}
_dirty: set[_Key] = set()


class _BriefDraft(BaseModel):
    """`RoomBrief` as the model fills it. Gemini response_schema: no
    extra="forbid" and no exclusive bounds (see insight_engine.py); the limits
    are applied afterwards (`_fit_brief`)."""

    # Field order and names mirror RoomBrief; `_fit_brief` brings the values within its limits.
    floor_mq: float | None = Field(default=None, description="Superficie del pavimento in metri quadrati")
    walls_mq: float | None = Field(default=None, description="Superficie delle pareti in metri quadrati")
    height_m: float | None = Field(default=None, description="Altezza del soffitto in metri")
    surfaces: str | None = Field(default=None, description="Pavimenti, pareti, soffitti: materiali e stato")
    systems: str | None = Field(default=None, description="Impianti elettrico, idraulico, riscaldamento")
    fixtures: str | None = Field(default=None, description="Porte, finestre, sanitari, elementi fissi")
    criticalities: list[str] = Field(default_factory=list, description="Criticità segnalate")
    decisions: list[str] = Field(default_factory=list, description="Decisioni prese dal cliente")
    open_questions: list[str] = Field(default_factory=list, description="Domande ancora aperte")


class _BriefUpdate(BaseModel):
    changed: bool = Field(description="true se i messaggi aggiungono o correggono fatti della scheda")
    brief: _BriefDraft
    summary: str | None = Field(default=None, description="Sintesi in una riga per l'indice delle stanze")


@dataclass(frozen=True)
class BriefTurn:
    """What the orchestrator knows at the end of a turn."""

    project_id: str
    session_id: str
    room_id: str | None  # active room at the end of the turn (None: no room chosen)
    is_guest: bool


def schedule_room_brief_refresh(turn: BriefTurn) -> asyncio.Task[None] | None:
    """Refresh the brief of the turn's room in the background; None when no
    refresh was started (guest, disabled, or a refresh of that room is running)."""
    if turn.is_guest or not settings.ROOM_BRIEF_ENABLED:
        return None
    key = (turn.session_id, turn.room_id or DEFAULT_ROOM_ID)
    if key in _running:
        _dirty.add(key)
        return None
    task = run_in_background(_refresh_until_clean(turn, key), name="room_brief_refresh")
    _running[key] = task
    return task


async def _refresh_until_clean(turn: BriefTurn, key: _Key) -> None:
    try:
        while True:
            _dirty.discard(key)
            await _refresh(turn.project_id, *key)
            if key not in _dirty:
                return
    finally:
        # Same loop step as the dirty check (no await in between): a turn that
        # ends now either starts a new task or is summarized by this one.
        _running.pop(key, None)


def _remember(key: _Key, message_id: str) -> None:
    _watermark[key] = message_id
    _watermark.move_to_end(key)
    while len(_watermark) > _WATERMARK_MAX:
        _watermark.popitem(last=False)


def _fit_text(value: str | None, limit: int) -> str | None:
    text = " ".join((value or "").split())
    return text[:limit] or None


def _fit_items(items: list[str]) -> list[str]:
    return [t for t in (_fit_text(i, 300) for i in items) if t][:20]


def _fit_measure(value: float | None, upper: float) -> float | None:
    return value if value is not None and 0 <= value <= upper else None


def _fit_brief(draft: _BriefDraft) -> RoomBrief:
    """The model's brief within RoomBrief's limits: an overlong text is cut and
    an impossible measure dropped, so one excess never freezes the brief."""
    return RoomBrief(
        floor_mq=_fit_measure(draft.floor_mq, 10_000),
        walls_mq=_fit_measure(draft.walls_mq, 10_000),
        height_m=_fit_measure(draft.height_m, 20),
        surfaces=_fit_text(draft.surfaces, 1000),
        systems=_fit_text(draft.systems, 1000),
        fixtures=_fit_text(draft.fixtures, 1000),
        criticalities=_fit_items(draft.criticalities),
        decisions=_fit_items(draft.decisions),
        open_questions=_fit_items(draft.open_questions),
    )


def _is_substantial(message: dict[str, Any]) -> bool:
    if message.get("role") != "user":
        return False
    if message.get("attachments"):
        return True
    text = " ".join(str(message.get("content") or "").split())
    return bool(text) and not _TRIVIAL.match(text)


def _new_messages(history: list[dict[str, Any]], watermark: str | None) -> list[dict[str, Any]]:
    """Messages after the watermark (all of them when it is not in the window)."""
    ids = [m.get("id") for m in history]
    return history[ids.index(watermark) + 1:] if watermark in ids else list(history)


def _format_messages(messages: list[dict[str, Any]]) -> str:
    lines = []
    for m in messages:
        who = {"user": "Cliente", "assistant": "SYD"}.get(m.get("role", ""), "Strumento")
        text = " ".join(str(m.get("content") or "").split())[:_MESSAGE_MAX_CHARS]
        attached = " [con allegati]" if m.get("attachments") else ""
        lines.append(f"{who}{attached}: {text}")
    return "\n".join(lines)


async def _room_history(session_id: str, room_id: str) -> list[dict[str, Any]]:
    repo = get_conversation_repository()
    limit = settings.ROOM_BRIEF_HISTORY_MESSAGES
    if room_id != DEFAULT_ROOM_ID:
        return await repo.get_context(session_id, limit=limit, room_id=room_id)
    # Project-wide talk: messages tagged "generale" or with no room at all (an
    # absent field cannot be queried). A turn without a room refreshes this brief
    # right away, so its messages are among the newest ones.
    history = await repo.get_context(session_id, limit=limit * _GENERAL_WINDOW_FACTOR)
    return [m for m in history if m.get("room_id") in (None, DEFAULT_ROOM_ID)][-limit:]


async def _ask_model(room: RoomSchema, messages: list[dict[str, Any]]) -> _BriefUpdate:
    scope = GENERAL_SCOPE if room.room_id == DEFAULT_ROOM_ID else ROOM_SCOPE.format(room_label=room.label)
    prompt = ROOM_BRIEF_PROMPT.format(
        room_label=room.label,
        room_type=room.room_type,
        scope=scope,
        current_brief=json.dumps(room.brief.model_dump(exclude_none=True), ensure_ascii=False),
        messages=_format_messages(messages),
    )
    response = await get_genai_client().aio.models.generate_content(
        model=get_model_id(ModelRole.SUMMARIZER),
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.1,
            response_mime_type="application/json",
            response_schema=_BriefUpdate,
            thinking_config=build_thinking_config(ModelRole.SUMMARIZER),
        ),
    )
    return _BriefUpdate.model_validate_json(response.text or "")


async def _refresh(project_id: str, session_id: str, room_id: str) -> None:
    """One refresh of one room. Never raises: the outcome is logged."""
    started = time.perf_counter()
    key = (session_id, room_id)
    outcome = "ok"
    try:
        async with asyncio.timeout(settings.ROOM_BRIEF_TIMEOUT_SECONDS):
            outcome = await _refresh_room(project_id, session_id, room_id, key)
    except TimeoutError:
        outcome = "timeout"
    except FailedPrecondition:
        # The room changed since it was read (rename, another refresh): the next turn retries.
        outcome = "conflict"
    except (GoogleAPIError, genai_errors.APIError, httpx.HTTPError, ValidationError) as exc:
        outcome = f"error:{type(exc).__name__}"
    (logger.info if outcome in ("ok", "unchanged", "no_new_facts", "no_room") else logger.warning)(
        "[RoomBrief] Refresh",
        extra={
            "event": "room_brief_refresh",
            "outcome": outcome,
            "session_id": session_id,
            "room_id": room_id,
            "duration_ms": round((time.perf_counter() - started) * 1000),
        },
    )


async def _refresh_room(project_id: str, session_id: str, room_id: str, key: _Key) -> str:
    rooms = get_room_repository()
    found, history = await asyncio.gather(
        rooms.get_room_versioned(project_id, room_id), _room_history(session_id, room_id)
    )
    if found is None:
        return "no_room"
    room, version = found
    new = _new_messages(history, _watermark.get(key))
    if not any(_is_substantial(m) for m in new):
        return "no_new_facts"
    # The watermark moves to the newest message actually summarized.
    newest_id = new[-1].get("id")
    update = await _ask_model(room, new)
    brief = _fit_brief(update.brief)
    summary = (update.summary or "").strip()[:200] or room.summary
    if update.changed and (brief != room.brief or summary != room.summary):
        await rooms.update_brief(project_id, room_id, brief=brief, summary=summary, expected_update_time=version)
        outcome = "ok"
    else:
        outcome = "unchanged"
    if isinstance(newest_id, str):
        _remember(key, newest_id)
    return outcome
