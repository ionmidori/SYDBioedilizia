"""Move the chat sessions of an anonymous account to a registered one.

The one transfer routine: the guest claim after login (service.py) and the
one-off admin recovery script both use it. It moves whole sessions by owner
uid, not by project id, so it stays valid when projects give way to a single
chat per user.

A session's data and who reads it:
- `sessions/{id}.userId`: backend owner checks, Firestore rules on messages;
- `projects/{id}` projection owner fields: dashboard, rooms, files, Storage rules;
- `projects/{id}/files/*.uploadedBy`: Storage/Firestore delete rules;
- the quote (`user_id` + client snapshot): refresh_quote_owner.
Rooms and messages carry no owner: they follow the projection and the session.

Per session the order is files → quote → projection + session (one batch) →
expiry. The session moves last, so a run interrupted earlier is finished by
running it again (it finds the session by its old owner); the expiry is removed
right after, and should that step fail the session is already registered-owned,
which the retention job and the account's next activity make permanent
(src/db/session_retention.py).
"""
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from google.cloud.firestore_v1.base_query import FieldFilter

from src.db.ownership import OWNER_KEYS
from src.db.projects.constants import FILES_PARENT_COLLECTION, PROJECTS_COLLECTION
from src.db.session_retention import clear_session_expiry, is_soft_deleted
from src.services.quote_drafts import quote_doc_ref, refresh_quote_owner

logger = logging.getLogger(__name__)

# Firestore allows 500 writes per batch.
_BATCH_SIZE = 400

_OLDEST = datetime.min.replace(tzinfo=UTC)


@dataclass(frozen=True)
class GuestSessions:
    """The sessions an anonymous account owns, most recent first."""

    session_ids: list[str]
    # The conversation to open after the move: the most recent one not in the bin.
    open_session_id: str | None


@dataclass(frozen=True)
class SessionContents:
    """What a set of sessions holds (the recovery script's dry run)."""

    messages: int
    files: int  # uploaded by the anonymous account (the ones whose uploader changes)
    rooms: int
    quotes: int


def _last_activity(data: dict[str, Any]) -> datetime:
    for key in ("updatedAt", "createdAt"):
        value = data.get(key)
        if isinstance(value, datetime):
            return value
    return _OLDEST


def _uploads_of(db: Any, session_id: str, uid: str) -> Any:
    files = db.collection(FILES_PARENT_COLLECTION).document(session_id).collection("files")
    return files.where(filter=FieldFilter("uploadedBy", "==", uid))


async def _count(query: Any) -> int:
    result = await query.count().get()
    return int(result[0][0].value)


async def find_guest_sessions(db: Any, uid: str) -> GuestSessions:
    query = db.collection(PROJECTS_COLLECTION).where(filter=FieldFilter("userId", "==", uid))
    sessions = [(snap.id, snap.to_dict() or {}) async for snap in query.select(["updatedAt", "createdAt", "is_deleted"]).stream()]
    sessions.sort(key=lambda item: _last_activity(item[1]), reverse=True)
    live = [session_id for session_id, data in sessions if not is_soft_deleted(data)]
    return GuestSessions(session_ids=[session_id for session_id, _ in sessions], open_session_id=next(iter(live), None))


async def count_contents(db: Any, sessions: GuestSessions, uid: str) -> SessionContents:
    messages = files = rooms = quotes = 0
    for session_id in sessions.session_ids:
        messages += await _count(db.collection(PROJECTS_COLLECTION).document(session_id).collection("messages"))
        files += await _count(_uploads_of(db, session_id, uid))
        rooms += await _count(db.collection(FILES_PARENT_COLLECTION).document(session_id).collection("rooms"))
        quotes += int((await quote_doc_ref(db, session_id).get()).exists)
    return SessionContents(messages=messages, files=files, rooms=rooms, quotes=quotes)


async def _move_files(db: Any, session_id: str, from_uid: str, to_uid: str) -> None:
    refs = [snap.reference async for snap in _uploads_of(db, session_id, from_uid).select([]).stream()]
    for start in range(0, len(refs), _BATCH_SIZE):
        batch = db.batch()
        for ref in refs[start:start + _BATCH_SIZE]:
            batch.update(ref, {"uploadedBy": to_uid})
        await batch.commit()


async def _move_owner(db: Any, session_id: str, from_uid: str, to_uid: str) -> None:
    """Projection and session in one batch: the chat changes owner at once."""
    batch = db.batch()
    projection_ref = db.collection(FILES_PARENT_COLLECTION).document(session_id)
    projection = await projection_ref.get()
    if projection.exists:
        data = projection.to_dict() or {}
        owner_fields = {key: to_uid for key in OWNER_KEYS if data.get(key) == from_uid}
        if owner_fields:
            batch.update(projection_ref, owner_fields)
    batch.update(db.collection(PROJECTS_COLLECTION).document(session_id), {"userId": to_uid})
    await batch.commit()


async def move_session(db: Any, session_id: str, from_uid: str, to_uid: str) -> None:
    """Move one session of `from_uid` to `to_uid` (order: see the module docstring).

    The caller has established that `from_uid` is an anonymous account the
    claimer proved to be, and `to_uid` a registered one.
    """
    await _move_files(db, session_id, from_uid, to_uid)
    await refresh_quote_owner(db, session_id, to_uid)  # no quote: no-op
    await _move_owner(db, session_id, from_uid, to_uid)
    await clear_session_expiry(db, session_id)
    logger.info(f"[GuestClaim] Session {session_id} moved from {from_uid} to {to_uid}")
