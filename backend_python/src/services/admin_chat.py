"""The client chat of a quote for the admin dossier (relay plan, PR 5).

The project id is the chat session id: the chat is read from
`sessions/{project_id}/messages`. Only the turns a person reads are kept (no
tool rows, no assistant rows that only call a tool). The change the team has
to read is highlighted:

- `followup`: the client asked a change in the chat while the team had this
  version of the quote → from `submitted_at` (when it reached the team);
- `revision`: the client opened the next revision after a send → from the
  newest send that reached them.

A start that is not known (a quote sent before `submitted_at` existed, no send
recorded) highlights nothing: the admin reads the whole chat.
"""
from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any

from src.core.config import settings
from src.repositories.conversation_repository import ConversationRepository
from src.repositories.room_repository import RoomRepository
from src.schemas.admin_quote import AdminChat, AdminChatMessage, ChatChangeKind
from src.services.admin_quotes import read_quote
from src.services.client_quote_view import sent_revisions

_CHAT_ROLES = ("user", "assistant")


def change_kind(quote: dict[str, Any]) -> ChatChangeKind | None:
    followup = quote.get("client_followup") or {}
    if followup.get("version") == int(quote.get("version") or 1):
        return "followup"
    if quote.get("client_revision"):
        return "revision"
    return None


async def _change_since(db: Any, project_id: str, quote: dict[str, Any], kind: ChatChangeKind | None) -> datetime | None:
    if kind == "followup":
        return quote.get("submitted_at")
    if kind == "revision":
        sent = await sent_revisions(db, project_id)  # newest revision first
        return sent[0].sent_at if sent else None
    return None


def _has_media(attachments: object) -> bool:
    if isinstance(attachments, dict):
        return any(attachments.values())
    return isinstance(attachments, list) and bool(attachments)


def _message(row: dict[str, Any], labels: dict[str, str], since: datetime | None) -> AdminChatMessage | None:
    role = row.get("role")
    content = row.get("content")
    text = content if isinstance(content, str) else ""
    has_media = _has_media(row.get("attachments"))
    if role not in _CHAT_ROLES or not (text.strip() or has_media):
        return None
    at = row.get("timestamp")
    at = at if isinstance(at, datetime) else None
    metadata = row.get("metadata")
    room_id = metadata.get("room_id") if isinstance(metadata, dict) else None
    return AdminChatMessage(
        id=row["id"],
        role=role,
        text=text,
        at=at,
        room_label=labels.get(room_id) if isinstance(room_id, str) else None,
        has_media=has_media,
        in_change=since is not None and at is not None and at >= since,
    )


async def admin_chat(db: Any, project_id: str) -> AdminChat:
    """Raises QuoteNotFoundError (no quote or a deleted one); read errors propagate."""
    quote = await read_quote(db, project_id)
    kind = change_kind(quote)
    limit = settings.ADMIN_CHAT_MAX_MESSAGES
    # One row more than shown: tells whether older messages were left out.
    rows, rooms, since = await asyncio.gather(
        ConversationRepository().list_for_admin(project_id, limit + 1),
        RoomRepository().list_rooms(project_id),
        _change_since(db, project_id, quote, kind),
    )
    labels = {room.room_id: room.label for room in rooms}
    messages = [m for row in rows[-limit:] if (m := _message(row, labels, since)) is not None]
    return AdminChat(messages=messages, change_kind=kind, change_since=since, truncated=len(rows) > limit)
