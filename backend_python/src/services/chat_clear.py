"""Quote-aware chat clear / restart orchestration service."""
from __future__ import annotations

from typing import Any

from google.api_core.exceptions import GoogleAPIError
from pydantic import ValidationError

from src.adk.adk_orchestrator import invalidate_adk_session
from src.core.context import bind_session
from src.core.exceptions import AppException, ChatMerged, PermissionDenied, RoomNotFoundError
from src.core.logger import get_logger
from src.db.firebase_client import get_async_firestore_client
from src.db.ownership import is_owner
from src.db.projects.constants import MERGED_INTO, PROJECTS_COLLECTION
from src.repositories.conversation_repository import get_conversation_repository
from src.repositories.room_repository import get_room_repository
from src.repositories.spec_store import CHAT_SPEC_KEY, get_spec_store
from src.schemas.chat_clear import ClearChatMode, ClearChatResponse
from src.services.audit import AuditAction, AuditResourceType, emit_audit_event
from src.services.confirmation_service import recalculate_after_clear
from src.services.quote_drafts import quote_doc_ref
from src.services.quote_state import QuoteStatus
from src.services.room_brief import invalidate_room_brief_state
from src.utils.datetime_utils import utc_now

logger = get_logger(__name__)


def _extract_room_ids(entries: Any) -> set[str]:
    if not isinstance(entries, list):
        return set()
    return {
        rid
        for entry in entries
        if isinstance(entry, dict) and isinstance(rid := entry.get("room_id"), str) and rid
    }


def quote_covers_scope(quote_data: dict[str, Any] | None, room_id: str | None) -> bool:
    """Return True when an active quote covers `room_id` (or the whole chat when `room_id` is None)."""
    if not quote_data or quote_data.get("status") == QuoteStatus.DELETED:
        return False
    if room_id is None:
        return True

    request = quote_data.get("request")
    request_dict = request if isinstance(request, dict) else {}
    referenced_rooms = (
        _extract_room_ids(quote_data.get("rooms"))
        | _extract_room_ids(quote_data.get("items"))
        | _extract_room_ids(request_dict.get("manual_work"))
        | _extract_room_ids(request_dict.get("ai_warnings"))
    )
    if not referenced_rooms:
        # Legacy or room-less active quote: conservatively soft-archive any room clear.
        return True
    return room_id in referenced_rooms


async def _recompute_draft(session_id: str, user_id: str) -> None:
    """The editable draft without the rooms just archived; a quote the team has is left as it
    is (D8). Best effort: the chat is cleared already, the next analysis brings the draft up."""
    try:
        await recalculate_after_clear(session_id, user_id)
    except (AppException, GoogleAPIError, ValidationError) as exc:  # never undo a clear the client sees
        logger.warning("[ChatClear] Draft not recomputed after the clear.", extra={"error": type(exc).__name__})


async def clear_chat(
    session_id: str,
    user_id: str,
    *,
    room_id: str | None = None,
) -> ClearChatResponse:
    """Clear one room or the full chat, soft-archiving when an active quote covers the scope."""
    bind_session(session_id)
    db = get_async_firestore_client()
    session_snap = await db.collection(PROJECTS_COLLECTION).document(session_id).get()

    if not session_snap.exists:
        if room_id is not None:
            raise RoomNotFoundError(session_id, room_id)
        invalidate_room_brief_state(session_id, None)
        await invalidate_adk_session(user_id, session_id)
        return ClearChatResponse(mode="hard_delete", room_id=None, affected_count=0, rooms_reset=0)

    session_data = session_snap.to_dict() or {}
    if not is_owner(session_data, user_id):
        raise PermissionDenied("Questa sessione appartiene a un altro utente.")
    if session_data.get(MERGED_INTO):
        raise ChatMerged()

    room_repo = get_room_repository()
    conv_repo = get_conversation_repository()

    if room_id is not None:
        await room_repo.require_room(session_id, room_id)

    quote_snap = await quote_doc_ref(db, session_id).get()
    quote_data = (quote_snap.to_dict() or None) if quote_snap.exists else None
    soft_archive = quote_covers_scope(quote_data, room_id)
    mode: ClearChatMode = "soft_archive" if soft_archive else "hard_delete"

    # Cancel any in-flight brief summarizer before mutating Firestore so it cannot overwrite the reset.
    invalidate_room_brief_state(session_id, room_id)

    now = utc_now()
    affected = await conv_repo.clear_messages(
        session_id,
        room_id=room_id,
        soft_archive=soft_archive,
        archived_at=now,
    )
    # The reset archives the rooms too (`cleared_at`): out of the card and the editable draft (D7).
    # The whole-chat spec from before the rooms goes too: it would come back on the card, with what
    # the client confirmed before, once no room has a spec left.
    if room_id is not None:
        rooms_reset = 1 if await room_repo.reset_brief(session_id, room_id) else 0
        await get_spec_store().archive_project_specs(session_id, now=now, keys=(CHAT_SPEC_KEY,))
    else:
        rooms_reset = await room_repo.reset_all_briefs(session_id)
        await get_spec_store().archive_project_specs(session_id, now=now)

    await invalidate_adk_session(user_id, session_id)
    # Only a draft with lines of what was cleared changes (no new revision for nothing).
    if soft_archive:
        await _recompute_draft(session_id, user_id)

    emit_audit_event(
        AuditAction.CHAT_CLEAR,
        AuditResourceType.PROJECT,
        resource_id=session_id,
        user_id=user_id,
        metadata={
            "mode": mode,
            "room_id": room_id,
            "affected_count": affected,
            "rooms_reset": rooms_reset,
        },
    )
    logger.info(
        "[ChatClear] Cleared chat",
        extra={
            "mode": mode,
            "room_id": room_id,
            "affected_count": affected,
            "rooms_reset": rooms_reset,
        },
    )
    return ClearChatResponse(
        mode=mode,
        room_id=room_id,
        affected_count=affected,
        rooms_reset=rooms_reset,
    )
