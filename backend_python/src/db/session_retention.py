"""Retention of chat sessions: only guest sessions expire.

`expireAt` marks a guest session for erasure once it has passed: the retention
job (src/services/retention) then erases the whole project — session,
messages, files, projection and Storage. (The Firestore TTL policies on
`sessions`/`messages` that used to do it are being retired: TTL never cascades
to subcollections or Storage.) A registered user's project is kept for as long
as the account lives — the privacy policy promises it and the account
lifecycle (12/13/24 months) governs it — so only guest sessions may carry
`expireAt`. (Projects soft-deleted by older code carried one too: none is left
and nothing soft-deletes a project any more, so the retention no longer has a
bin to empty — Phase 139.)

A session stops being a guest one when it is claimed by a registered user or when
an anonymous account is upgraded (same uid). It must then lose `expireAt` on the
session document AND on every message, or the messages would disappear from a
project that is meant to stay.
"""
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from google.cloud.firestore_v1 import DELETE_FIELD
from google.cloud.firestore_v1.base_query import FieldFilter
from src.auth.user_lookup import AccountKind
from src.db.batching import BatchWriter
from src.db.ownership import is_guest_placeholder
from src.utils.datetime_utils import utc_now

EXPIRE_AT = "expireAt"
GUEST_SESSION_TTL = timedelta(days=30)
_OLDEST = datetime.min.replace(tzinfo=UTC)

# Literal names: importing src.db.projects here would be circular (its mutations
# module imports this one). Same collections as src/db/projects/constants.py.
_SESSIONS = "sessions"
_PROJECTS = "projects"



def expiry_fields(*, is_guest: bool, now: datetime | None = None) -> dict[str, Any]:
    """The `expireAt` field to add to a guest write; nothing for a registered one.

    Each write stamps 30 days from now: the session document is renewed on every
    write, while a message keeps the expiry it was written with.
    """
    if not is_guest:
        return {}
    return {EXPIRE_AT: (now or utc_now()) + GUEST_SESSION_TTL}


def is_soft_deleted(data: dict[str, Any] | None) -> bool:
    """A soft-deleted project: its `expireAt` is the GDPR purge, never to be cleared."""
    return bool(data) and data.get("is_deleted") is True


def last_activity(data: dict[str, Any]) -> datetime:
    """When a session was last written (`updatedAt`, else `createdAt`); the
    oldest possible time when neither is a timestamp."""
    for key in ("updatedAt", "createdAt"):
        value = data.get(key)
        if isinstance(value, datetime):
            return value
    return _OLDEST


def needs_permanence(data: dict[str, Any] | None) -> bool:
    """A live session that still carries a guest expiry."""
    return bool(data) and EXPIRE_AT in data and not is_soft_deleted(data)


def _messages(db: Any, session_id: str) -> Any:
    # Only the TTL field: never download the conversation to rewrite one field.
    return db.collection(_SESSIONS).document(session_id).collection("messages").select([EXPIRE_AT])


async def _marked_messages(db: Any, session_id: str) -> AsyncIterator[Any]:
    """Messages of a session that still carry `expireAt`."""
    async for message in _messages(db, session_id).stream():
        if EXPIRE_AT in (message.to_dict() or {}):
            yield message


async def _update_all(db: Any, messages: AsyncIterator[Any], data: dict[str, Any]) -> int:
    """Apply `data` to every message, in bounded write batches. Returns the count."""
    async with BatchWriter(db) as writer:
        async for message in messages:
            await writer.update(message.reference, data)
    return writer.written


async def clear_session_expiry(db: Any, session_id: str) -> int:
    """Make a session permanent: drop `expireAt` from its messages, then from its
    `projects/` projection and, last, from the session document.

    A soft-deleted project is left alone (its `expireAt` is the purge). The session
    document goes last, so an interrupted run leaves it marked and a later run
    finishes the job. Idempotent; never creates missing documents. Returns the
    messages updated.
    """
    session_ref = db.collection(_SESSIONS).document(session_id)
    session = await session_ref.get()
    session_data = session.to_dict() if session.exists else None
    if is_soft_deleted(session_data):
        return 0

    cleared = await _update_all(db, _marked_messages(db, session_id), {EXPIRE_AT: DELETE_FIELD})

    project_ref = db.collection(_PROJECTS).document(session_id)
    project = await project_ref.get()
    if project.exists and EXPIRE_AT in (project.to_dict() or {}):
        await project_ref.update({EXPIRE_AT: DELETE_FIELD})
    if session_data is not None and EXPIRE_AT in session_data:
        await session_ref.update({EXPIRE_AT: DELETE_FIELD})
    return cleared


async def make_user_sessions_permanent(db: Any, uid: str) -> int:
    """Make every live session of a registered user permanent — including the ones
    created while the account was anonymous and not written to since the upgrade.
    Returns the sessions changed."""
    if not uid:
        return 0
    query = db.collection(_SESSIONS).where(filter=FieldFilter("userId", "==", uid))
    changed = 0
    async for session in query.select([EXPIRE_AT, "is_deleted"]).stream():
        if needs_permanence(session.to_dict()):
            await clear_session_expiry(db, session.id)
            changed += 1
    return changed


@dataclass
class BackfillReport:
    """Outcome of `backfill_registered_sessions` (counts are sessions unless noted)."""

    applied: bool
    scanned: int = 0
    made_permanent: int = 0  # registered owner: expiry removed (or would be, in a dry run)
    messages: int = 0        # marked messages of those sessions
    guest: int = 0           # guest owner, anonymous account or no owner: expiry kept
    orphaned: int = 0        # owner account no longer exists: left to account retention
    soft_deleted: int = 0    # deleted project: its expiry is the purge, kept


async def backfill_registered_sessions(
    db: Any,
    account_kind: Callable[[str], Awaitable[AccountKind]],
    *,
    apply: bool,
) -> BackfillReport:
    """Remove `expireAt` from every live session (and its messages) owned by a
    registered account — the repair for sessions written before only guest
    sessions were allowed to expire.

    With ``apply=False`` nothing is written: the report says what would change.
    Each owner is looked up once; a lookup error stops the run rather than
    guessing (a wrong "anonymous" would leave a project to the TTL).
    """
    report = BackfillReport(applied=apply)
    kinds: dict[str, AccountKind] = {}

    async for session in db.collection(_SESSIONS).select(["userId", EXPIRE_AT, "is_deleted"]).stream():
        report.scanned += 1
        data = session.to_dict() or {}
        if EXPIRE_AT not in data:
            continue
        if is_soft_deleted(data):
            report.soft_deleted += 1
            continue
        owner = data.get("userId") or ""
        if is_guest_placeholder(owner):
            report.guest += 1
            continue
        if owner not in kinds:
            kinds[owner] = await account_kind(owner)
        kind = kinds[owner]
        if kind is AccountKind.ANONYMOUS:
            report.guest += 1
        elif kind is AccountKind.MISSING:
            report.orphaned += 1
        else:
            report.made_permanent += 1
            if apply:
                report.messages += await clear_session_expiry(db, session.id)
            else:
                report.messages += sum([1 async for _ in _marked_messages(db, session.id)])
    return report
