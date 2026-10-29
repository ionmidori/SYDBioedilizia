"""Which chat is the user's: `users/{uid}.chat_id`, decided by the backend.

The chat keeps its id (a `sessions/{id}` document with its `projects/{id}`
projection, rooms, files and quote); the pointer only says which one is the
user's. A chat is valid for a user when it exists, is theirs, is not in the
bin and was not merged into another chat.

`resolve_user_chat` runs in one transaction on the user document, so two
devices asking at once get the same chat: the first commit wins and the other
retries and finds the pointer.
"""
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any

from google.cloud.firestore_v1.base_query import FieldFilter

from src.db import transactions
from src.db.ownership import is_owner
from src.db.projects.constants import FILES_PARENT_COLLECTION, MERGED_INTO, PROJECTS_COLLECTION
from src.db.projects.mutations import new_session_document, project_projection
from src.db.session_retention import is_soft_deleted, last_activity
from src.models.project import ProjectCreate
from src.services.audit import AuditAction, AuditResourceType, emit_audit_event
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

USERS_COLLECTION = "users"
CHAT_ID = "chat_id"
CHAT_ASSIGNED_AT = "chat_assigned_at"


class ChatState(StrEnum):
    VALID = "valid"
    GONE = "gone"
    FOREIGN = "foreign"
    DELETED = "deleted"
    MERGED = "merged"


def chat_state(data: dict[str, Any] | None, uid: str) -> ChatState:
    """Whether a `sessions/{id}` document can be the user's chat, and why not."""
    if data is None:
        return ChatState.GONE
    if not is_owner(data, uid):
        return ChatState.FOREIGN
    if is_soft_deleted(data):
        return ChatState.DELETED
    if data.get(MERGED_INTO):
        return ChatState.MERGED
    return ChatState.VALID


@dataclass(frozen=True)
class UserChat:
    chat_id: str
    created: bool  # a new, empty chat was created for the user


@dataclass(frozen=True)
class _Resolution:
    chat_id: str
    created: bool
    # Why the pointer was written (None: it was already right).
    reason: str | None


def _user_ref(db: Any, uid: str) -> Any:
    return db.collection(USERS_COLLECTION).document(uid)


def _session_ref(db: Any, chat_id: str) -> Any:
    return db.collection(PROJECTS_COLLECTION).document(chat_id)


async def _session(db: Any, chat_id: str, transaction: Any) -> dict[str, Any] | None:
    snap = await _session_ref(db, chat_id).get(transaction=transaction)
    return (snap.to_dict() or {}) if snap.exists else None


async def _pointed_chat(db: Any, uid: str, pointer: str, transaction: Any) -> tuple[str | None, ChatState]:
    """The valid chat a pointer leads to (following one merge), else None, with
    the state of the pointed chat."""
    data = await _session(db, pointer, transaction)
    state = chat_state(data, uid)
    if state is ChatState.VALID:
        return pointer, state
    target = (data or {}).get(MERGED_INTO) if state is ChatState.MERGED else None
    if isinstance(target, str) and target:
        if chat_state(await _session(db, target, transaction), uid) is ChatState.VALID:
            return target, state
    return None, state


async def _latest_valid_chat(db: Any, uid: str, transaction: Any) -> str | None:
    query = db.collection(PROJECTS_COLLECTION).where(filter=FieldFilter("userId", "==", uid))
    chats = [
        (snap.id, data)
        async for snap in query.stream(transaction=transaction)
        if chat_state(data := snap.to_dict() or {}, uid) is ChatState.VALID
    ]
    return max(chats, key=lambda chat: last_activity(chat[1]))[0] if chats else None


def _pointer(snap: Any) -> str | None:
    value = (snap.to_dict() or {}).get(CHAT_ID) if snap.exists else None
    return value if isinstance(value, str) and value else None


async def _resolve(db: Any, uid: str, now: datetime, prefer: str | None, transaction: Any) -> _Resolution:
    user_ref = _user_ref(db, uid)
    pointer = _pointer(await user_ref.get(transaction=transaction))
    reason = "missing"
    chat_id: str | None = None
    if pointer is not None:
        chat_id, state = await _pointed_chat(db, uid, pointer, transaction)
        if chat_id == pointer:
            return _Resolution(pointer, created=False, reason=None)
        reason = state.value
    if chat_id is None and prefer is not None:
        if chat_state(await _session(db, prefer, transaction), uid) is ChatState.VALID:
            chat_id = prefer
    if chat_id is None:
        chat_id = await _latest_valid_chat(db, uid, transaction)

    # Reads done: writes from here on.
    created = chat_id is None
    if chat_id is None:
        chat_id = str(uuid.uuid4())
        title = ProjectCreate().title
        transaction.set(_session_ref(db, chat_id), new_session_document(chat_id, uid, title, now))
        transaction.set(
            db.collection(FILES_PARENT_COLLECTION).document(chat_id), project_projection(chat_id, uid, title, now)
        )
    transaction.set(user_ref, {CHAT_ID: chat_id, CHAT_ASSIGNED_AT: now}, merge=True)
    return _Resolution(chat_id, created=created, reason=reason)


async def resolve_user_chat(
    db: Any, uid: str, *, now: datetime | None = None, prefer: str | None = None
) -> UserChat:
    """The user's chat, assigned now if the pointer is missing or no longer valid.

    Without a valid pointer: the chat a merged one went into, else `prefer` when
    it is a valid chat of the user (the guest claim's chat), else the user's most
    recent valid chat, else a new one.
    """
    now = now or utc_now()

    async def body(transaction: Any) -> _Resolution:
        return await _resolve(db, uid, now, prefer, transaction)

    resolution: _Resolution = await transactions.run_transaction(db, body)
    if resolution.reason is not None:
        emit_audit_event(
            AuditAction.USER_CHAT_ASSIGN, AuditResourceType.USER, uid,
            user_id=uid, metadata={"reason": resolution.reason, "created": resolution.created},
        )
        logger.info(
            "[UserChat] Chat assigned",
            extra={"uid": uid, "reason": resolution.reason, "chat_created": resolution.created},
        )
    return UserChat(chat_id=resolution.chat_id, created=resolution.created)


async def read_user_chat(db: Any, uid: str) -> str | None:
    """The chat `resolve_user_chat` would give now, without `prefer` and without
    creating one: the valid pointer (following one merge), else the user's most
    recent valid chat. Writes nothing."""
    pointer = _pointer(await _user_ref(db, uid).get())
    if pointer is not None:
        chat_id, _ = await _pointed_chat(db, uid, pointer, None)
        if chat_id is not None:
            return chat_id
    return await _latest_valid_chat(db, uid, None)
