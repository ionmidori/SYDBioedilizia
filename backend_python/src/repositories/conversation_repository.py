import logging
from datetime import datetime
from typing import Any

from google.cloud import firestore as async_firestore
from google.cloud.firestore_v1 import FieldFilter
from pydantic import BaseModel

from src.core.exceptions import PermissionDenied
from src.db.firebase_client import get_async_firestore_client, get_firestore_client
from src.db.projects import sync_project_cover
from src.db.projects.constants import FILE_ROOM_FIELD
from src.db.session_retention import clear_session_expiry, expiry_fields, needs_permanence
from src.utils.download import storage_path_from_url

logger = logging.getLogger(__name__)

# Room of a message (queried with `timestamp`, see firestore.indexes.json).
MESSAGE_ROOM_FIELD = 'metadata.room_id'


def _check_session_owner(session_id: str, current_owner: str, user_id: str | None) -> None:
    """🛡️ A session with an owner is never shared: not another account's, not a
    legacy `guest_*` one. Chats move between owners only through the guest
    claim, with proof (src/services/guest_claim)."""
    if user_id and current_owner and current_owner != user_id:
        logger.warning(f"[Repo] ⛔ Session {session_id} owned by another user — access denied for {user_id}")
        raise PermissionDenied("Questa sessione appartiene a un altro utente.")

class ConversationRepository:
    """
    Repository for managing conversation data, sessions, and file metadata.
    Abstracts Firestore access for chat-related operations.
    """

    def __init__(self):
        # We could inject the db client here if we wanted to be pure,
        # but for now usage of the singleton getter is consistent with the codebase.
        pass

    def _get_db(self):
        """Returns the sync Firestore client (firebase-admin)."""
        return get_firestore_client()

    def _get_async_db(self):
        """Returns the async Firestore client (google-cloud-firestore)."""
        return get_async_firestore_client()

    async def _make_permanent_if_marked(
        self, db: Any, session_id: str, session_data: dict[str, Any] | None, *, is_guest: bool
    ) -> None:
        """A registered write on a session that still carries a guest expiry
        (claimed guest session, upgraded anonymous account) makes it permanent,
        messages included. See src/db/session_retention.py.

        Runs after the caller's essential writes: if it fails, the session stays
        marked and the next registered write (or activity touch) retries.
        """
        if is_guest or not needs_permanence(session_data):
            return
        cleared = await clear_session_expiry(db, session_id)
        logger.info(f"[Repo] Session {session_id} is now permanent ({cleared} messages unmarked)")

    async def save_message(
        self,
        session_id: str,
        role: str,
        content: str,
        metadata: dict[str, Any] | None = None,
        tool_calls: list[dict[str, Any]] | None = None,
        tool_call_id: str | None = None,
        attachments: Any | None = None,
        timestamp: datetime | None = None,
        room_id: str | None = None,
        message_id: str | None = None,
        user_id: str | None = None,
        *,
        is_guest: bool,
    ) -> bool:
        """Save a message to Firestore with tool support and media attachments.

        Never raises: errors are logged and reported as False.

        When ``message_id`` is provided it is used as the Firestore document id
        (via ``document(id).set(...)``) instead of an auto-generated id. This
        lets the streamed message and its persisted row share one identity, so
        the client never has to swap a temporary SDK id for a Firestore id after
        the turn — the swap is what re-mounts the bubble and causes flicker.

        ``is_guest`` (required) decides retention: only guest sessions and their
        messages carry ``expireAt`` (Firestore TTL).
        """
        try:
            if role == "user":
                logger.info(f"[Repo] Saving user message to session {session_id} with timestamp {timestamp}")

            db = self._get_async_db()

            # 🛡️ Defense: Ensure Pydantic models are dumped
            if tool_calls:
                tool_calls = [tc.model_dump() if isinstance(tc, BaseModel) else tc for tc in tool_calls]

            if attachments and isinstance(attachments, list):
                attachments = [att.model_dump() if isinstance(att, BaseModel) else att for att in attachments]
            elif isinstance(attachments, BaseModel):
                attachments = attachments.model_dump()

            message_data = {
                'role': role,
                'content': content,
                'timestamp': timestamp if timestamp else async_firestore.SERVER_TIMESTAMP,
                **expiry_fields(is_guest=is_guest),
            }

            if room_id:
                metadata = metadata or {}
                metadata['room_id'] = room_id

            if metadata:
                message_data['metadata'] = metadata

            if tool_calls:
                message_data['tool_calls'] = tool_calls

            if tool_call_id:
                message_data['tool_call_id'] = tool_call_id

            if attachments:
                message_data['attachments'] = attachments

            # Add to messages subcollection.
            # Stable id → document(id).set() so the row keeps the same identity
            # as the streamed message; otherwise let Firestore auto-generate one.
            messages_ref = db.collection('sessions').document(session_id).collection('messages')
            if message_id:
                await messages_ref.document(message_id).set(message_data)
            else:
                await messages_ref.add(message_data)

            # Update session metadata
            session_ref = db.collection('sessions').document(session_id)
            session_doc = await session_ref.get()
            session_data = session_doc.to_dict() if session_doc.exists else None

            session_update = {
                'updatedAt': async_firestore.SERVER_TIMESTAMP,
                'sessionId': session_id,
                'messageCount': async_firestore.Increment(1),
                **expiry_fields(is_guest=is_guest),
            }

            if not session_doc.exists:
                session_update['createdAt'] = async_firestore.SERVER_TIMESTAMP

            # SECURITY (F-12): stamp the owner on the session doc when it is not
            # already set, so the Firestore ownership rule (sessions/*/messages
            # read: exists(parent) && userId == uid) can authorize the owner's
            # direct client reads. Never overwrite an existing owner — that would
            # let one user hijack another's (already claimed) session.
            if user_id:
                existing_owner = (session_data or {}).get('userId')
                if not existing_owner:
                    session_update['userId'] = user_id

            await session_ref.set(session_update, merge=True)
            await self._make_permanent_if_marked(db, session_id, session_data, is_guest=is_guest)

            logger.info(f"[Repo] Saved {role} message to session {session_id}")
            return True

        except Exception as e:
            logger.error(f"[Repo] Error saving message: {str(e)}", exc_info=True)
            return False

    async def get_context(
        self,
        session_id: str,
        limit: int = 10,
        room_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Retrieve conversation history including tool data and attachments.

        Args:
            session_id: Session to fetch messages from.
            limit: Max messages to return (the newest ones).
            room_id: If provided, only messages tagged with this room
                     (`metadata.room_id`): the filter runs in the query, before
                     the limit (composite index in firestore.indexes.json).
                     Untagged messages (project-wide talk, every turn before
                     Phase 138) are NOT included: callers that need them add an
                     unscoped read.
        """
        try:
            db = self._get_async_db()

            messages_ref = db.collection('sessions').document(session_id).collection('messages')
            if room_id:
                messages_ref = messages_ref.where(filter=FieldFilter(MESSAGE_ROOM_FIELD, '==', room_id))
            messages_ref = (
                messages_ref
                .order_by('timestamp', direction=async_firestore.Query.DESCENDING)
                .limit(limit)
            )

            # 🚀 Async iteration
            messages_reversed = []
            async for doc in messages_ref.stream():
                data = doc.to_dict()

                msg = {
                    'id': doc.id,
                    'role': data.get('role', 'user'),
                    'content': data.get('content', '')
                }
                if 'tool_calls' in data:
                    msg['tool_calls'] = data['tool_calls']
                if 'tool_call_id' in data:
                    msg['tool_call_id'] = data['tool_call_id']
                if 'attachments' in data:
                    msg['attachments'] = data['attachments']
                room_id = (data.get('metadata') or {}).get('room_id')
                if room_id:
                    msg['room_id'] = room_id

                messages_reversed.append(msg)

            # Re-order chronologically for the LLM
            messages = messages_reversed[::-1]

            logger.info(f"[Repo] Retrieved {len(messages)} LATEST messages for session {session_id}")
            return messages

        except Exception as e:
            logger.error(f"[Repo] Error retrieving messages: {str(e)}", exc_info=True)
            return []

    async def latest_assistant_message_id(self, session_id: str) -> str | None:
        """Id of the newest assistant message of the session (None if there is none).

        The ADK orchestrator compares it with the last reply its in-memory
        session knows: a mismatch means another instance served later turns.
        Reads only the `role` of the last messages (single-field timestamp index),
        enough to step over the tool rows and unanswered user turns that can follow
        a reply; errors propagate so the caller decides how to degrade.
        """
        db = self._get_async_db()
        messages_ref = (
            db.collection('sessions')
            .document(session_id)
            .collection('messages')
            .order_by('timestamp', direction=async_firestore.Query.DESCENDING)
            .select(['role'])
            .limit(20)
        )
        async for doc in messages_ref.stream():
            if (doc.to_dict() or {}).get('role') == 'assistant':
                return doc.id
        return None

    async def assert_session_access(self, session_id: str, user_id: str) -> None:
        """Raise PermissionDenied if the session exists and belongs to another user.

        Read-only: a missing session is allowed (the caller is about to create it).
        """
        db = self._get_async_db()
        doc = await db.collection('sessions').document(session_id).get()
        if doc.exists:
            _check_session_owner(session_id, (doc.to_dict() or {}).get('userId', ''), user_id)

    async def ensure_session(self, session_id: str, user_id: str | None = None, *, is_guest: bool) -> None:
        """
        Ensure session document exists in Firestore.
        If user_id is provided and the session doesn't exist, it's created with that owner.

        ``is_guest`` (required) decides retention: a guest session expires 30 days
        after its last write; a registered user's session never does, and one that
        still carries an expiry becomes permanent here (claim or account upgrade).
        """
        try:
            db = self._get_async_db()

            session_ref = db.collection('sessions').document(session_id)
            doc = await session_ref.get()

            if not doc.exists:
                # Determine owner
                owner_id = user_id if user_id else f"guest_{session_id[:8]}"

                await session_ref.set({
                    'sessionId': session_id,
                    'userId': owner_id,
                    'title': 'Nuovo Progetto',
                    'status': 'draft',
                    'thumbnailUrl': None,
                    'createdAt': async_firestore.SERVER_TIMESTAMP,
                    'updatedAt': async_firestore.SERVER_TIMESTAMP,
                    'messageCount': 0,
                    **expiry_fields(is_guest=is_guest),
                })
                logger.info(f"[Repo] Created new session {session_id} for user {owner_id}")

                # Sync to Projects collection
                project_ref = db.collection('projects').document(session_id)
                project_snap = await project_ref.get()
                if not project_snap.exists:
                    await project_ref.set({
                        'id': session_id,
                        'name': 'Nuovo Progetto',
                        'userId': owner_id,
                        'createdAt': async_firestore.SERVER_TIMESTAMP,
                        'updatedAt': async_firestore.SERVER_TIMESTAMP,
                        'status': 'active'
                    })
                    logger.info(f"[Repo] 🚀 Sync: Created project {session_id} from session")
            else:
                session_data = doc.to_dict() or {}
                current_owner = session_data.get('userId', '')

                _check_session_owner(session_id, current_owner, user_id)

                # After the ownership check: a foreign session is never touched.
                update_data: dict[str, Any] = expiry_fields(is_guest=is_guest)

                # An ownerless session gets its first writer as owner (like save_message).
                if user_id and not current_owner:
                    update_data['userId'] = user_id
                    update_data['updatedAt'] = async_firestore.SERVER_TIMESTAMP

                    # Also update project
                    project_ref = db.collection('projects').document(session_id)
                    project_snap = await project_ref.get()
                    if project_snap.exists:
                        await project_ref.update({'userId': user_id, 'updatedAt': async_firestore.SERVER_TIMESTAMP})
                    logger.info(f"[Repo] Session {session_id} now owned by {user_id}")

                if update_data:
                    await session_ref.update(update_data)

                # Backfill check
                project_ref = db.collection('projects').document(session_id)
                project_snap = await project_ref.get()
                if not project_snap.exists:
                     session_data = doc.to_dict() or {}
                     await project_ref.set({
                        'id': session_id,
                        'name': session_data.get('title', 'Progetto Recuperato'),
                        'userId': session_data.get('userId', user_id or 'unknown'),
                        'createdAt': session_data.get('createdAt', async_firestore.SERVER_TIMESTAMP),
                        'updatedAt': async_firestore.SERVER_TIMESTAMP,
                        'status': 'active'
                    })
                     logger.info(f"[Repo] 🚀 Sync: Backfilled missing project {session_id}")

                # Last: claim and projection are done even if this cleanup fails.
                await self._make_permanent_if_marked(db, session_id, session_data, is_guest=is_guest)

        except PermissionDenied:
            raise
        except Exception as e:
            logger.error(f"[Repo] Error ensuring session: {str(e)}", exc_info=True)

    async def save_file_metadata(
        self,
        project_id: str,
        file_data: dict[str, Any],
        *,
        file_id: str | None = None,
        room_id: str | None = None,
    ) -> str | None:
        """
        Save file metadata to the project's 'files' subcollection.

        Every file carries `metadata.storage_path` (media are read by path, the
        signed `url` expires) and, when known, the room it belongs to (`roomId`,
        see src/repositories/room_repository.py). `file_id` becomes the document
        id (stable: the upload's asset id). Returns the document id, or None
        when the file was already registered or the write failed (logged).
        """
        try:
            db = self._get_async_db()

            files_ref = db.collection('projects').document(project_id).collection('files')

            # Check for existing
            existing_docs = await files_ref.where('url', '==', file_data['url']).limit(1).get()
            if len(existing_docs) > 0:
                logger.debug(f"[Repo] File already exists: {file_data.get('name')}")
                return None

            metadata = dict(file_data.get('metadata') or {})
            if not metadata.get('storage_path'):
                path = storage_path_from_url(file_data['url'])
                if path:
                    metadata['storage_path'] = path

            doc_data = {
                'url': file_data['url'],
                'type': file_data.get('type', 'image'),
                'name': file_data.get('name', f"File {datetime.now().isoformat()}"),
                'size': file_data.get('size', 0),
                'uploadedBy': file_data.get('uploadedBy', 'system'),
                'uploadedAt': async_firestore.SERVER_TIMESTAMP,
                'mimeType': file_data.get('mimeType', 'application/octet-stream'),
                'metadata': metadata,
                'thumbnailUrl': file_data.get('thumbnailUrl')
            }
            # Absent (not null) when unknown: the default room picks up files without it.
            if room_id:
                doc_data[FILE_ROOM_FIELD] = room_id

            if file_id:
                doc_ref = files_ref.document(file_id)
                await doc_ref.set(doc_data)
            else:
                _, doc_ref = await files_ref.add(doc_data)
            logger.info(f"[Repo] 🖼️ Saved file metadata: {doc_data['name']}")

            # Trigger sync (Coupled for now)
            await sync_project_cover(project_id)
            return doc_ref.id

        except Exception as e:
            logger.error(f"[Repo] Error saving file metadata: {str(e)}", exc_info=True)
            return None

    def get_history_sync(self, session_id: str, limit: int = 20) -> list[dict[str, Any]]:
        """
        SYNCHRONOUS retrieval for legacy wrappers.
        """
        try:
            db = self._get_db()

            messages_ref = (
                db.collection('sessions')
                .document(session_id)
                .collection('messages')
                .order_by('timestamp', direction=async_firestore.Query.DESCENDING)
                .limit(limit)
            )

            docs = messages_ref.stream()

            messages_reversed = []
            for doc in docs:
                data = doc.to_dict()
                messages_reversed.append({
                    'role': data.get('role', 'user'),
                    'content': data.get('content', '')
                })

            return messages_reversed[::-1]

        except Exception as e:
            logger.error(f"[Repo] (sync) Error retrieving messages: {str(e)}", exc_info=True)
            return []

# Dependency Injection Helper
def get_conversation_repository() -> ConversationRepository:
    return ConversationRepository()
