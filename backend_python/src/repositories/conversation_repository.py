import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta, timezone
from firebase_admin import firestore as sync_firestore
from google.cloud import firestore as async_firestore
from src.db.firebase_client import get_firestore_client, get_async_firestore_client
from src.db.projects import sync_project_cover

logger = logging.getLogger(__name__)

# TTL for sessions and messages in days
SESSION_TTL_DAYS = 30

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

    async def save_message(
        self,
        session_id: str,
        role: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
        tool_calls: Optional[List[Dict[str, Any]]] = None,
        tool_call_id: Optional[str] = None,
        attachments: Optional[Any] = None,
        timestamp: Optional[datetime] = None
    ) -> None:
        """Save a message to Firestore with tool support and media attachments."""
        try:
            if role == "user":
                logger.info(f"[Repo] Saving user message to session {session_id} with timestamp {timestamp}")
            
            db = self._get_async_db()
            
            # 🛡️ Defense: Ensure Pydantic models are dumped
            if tool_calls:
                tool_calls = [tc.model_dump() if hasattr(tc, 'model_dump') else tc for tc in tool_calls]
            
            if attachments and isinstance(attachments, list):
                attachments = [att.model_dump() if hasattr(att, 'model_dump') else att for att in attachments]
            elif attachments and hasattr(attachments, 'model_dump'):
                attachments = attachments.model_dump()

            # 🚀 Use correct sentinel for Async Client
            
            # Calculate expireAt for TTL (30 days from now)
            expire_at = datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS)

            message_data = {
                'role': role,
                'content': content,
                'timestamp': timestamp if timestamp else async_firestore.SERVER_TIMESTAMP,
                'expireAt': expire_at
            }
            
            if metadata:
                message_data['metadata'] = metadata
                
            if tool_calls:
                message_data['tool_calls'] = tool_calls
                
            if tool_call_id:
                message_data['tool_call_id'] = tool_call_id

            if attachments:
                message_data['attachments'] = attachments
            
            # Add to messages subcollection
            await db.collection('sessions').document(session_id).collection('messages').add(message_data)
            
            # Update session metadata
            session_ref = db.collection('sessions').document(session_id)
            session_doc = await session_ref.get()
            
            session_update = {
                'updatedAt': async_firestore.SERVER_TIMESTAMP,
                'sessionId': session_id,
                'messageCount': async_firestore.Increment(1),
                'expireAt': expire_at
            }
            
            if not session_doc.exists:
                session_update['createdAt'] = async_firestore.SERVER_TIMESTAMP
                
            await session_ref.set(session_update, merge=True)
            
            logger.info(f"[Repo] Saved {role} message to session {session_id}")
            
        except Exception as e:
            logger.error(f"[Repo] Error saving message: {str(e)}", exc_info=True)

    async def get_context(
        self,
        session_id: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Retrieve conversation history including tool data and attachments."""
        try:
            db = self._get_async_db()
            
            messages_ref = (
                db.collection('sessions')
                .document(session_id)
                .collection('messages')
                .order_by('timestamp', direction=async_firestore.Query.DESCENDING)
                .limit(limit)
            )
            
            # 🚀 Async iteration
            messages_reversed = []
            async for doc in messages_ref.stream():
                data = doc.to_dict()
                msg = {
                    'role': data.get('role', 'user'),
                    'content': data.get('content', '')
                }
                if 'tool_calls' in data:
                    msg['tool_calls'] = data['tool_calls']
                if 'tool_call_id' in data:
                    msg['tool_call_id'] = data['tool_call_id']
                if 'attachments' in data:
                    msg['attachments'] = data['attachments']
                    
                messages_reversed.append(msg)
            
            # Re-order chronologically for the LLM
            messages = messages_reversed[::-1]
            
            logger.info(f"[Repo] Retrieved {len(messages)} LATEST messages for session {session_id}")
            return messages
            
        except Exception as e:
            logger.error(f"[Repo] Error retrieving messages: {str(e)}", exc_info=True)
            return []

    async def ensure_session(self, session_id: str, user_id: Optional[str] = None) -> None:
        """
        Ensure session document exists in Firestore.
        If user_id is provided and the session doesn't exist, it's created with that owner.
        """
        try:
            db = self._get_async_db()
            
            session_ref = db.collection('sessions').document(session_id)
            doc = await session_ref.get()
            
            expire_at = datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS)

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
                    'expireAt': expire_at,
                    'messageCount': 0
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
                        'expireAt': expire_at,
                        'status': 'active'
                    })
                    logger.info(f"[Repo] 🚀 Sync: Created project {session_id} from session")
            else:
                # 🔄 Session Claiming Logic: If existing session is a guest one, and we have a real user, upgrade it.
                session_data = doc.to_dict()
                current_owner = session_data.get('userId', '')
                
                update_data = {'expireAt': expire_at}
                
                if user_id and current_owner.startswith('guest_'):
                    update_data['userId'] = user_id
                    update_data['updatedAt'] = async_firestore.SERVER_TIMESTAMP
                    
                    # Also update project
                    project_ref = db.collection('projects').document(session_id)
                    project_snap = await project_ref.get()
                    if project_snap.exists:
                        await project_ref.update({'userId': user_id, 'updatedAt': async_firestore.SERVER_TIMESTAMP})
                    logger.info(f"[Repo] 🔄 CLAIM: Session {session_id} migrated from {current_owner} to {user_id}")
                
                await session_ref.update(update_data)
                
                # Backfill check
                project_ref = db.collection('projects').document(session_id)
                project_snap = await project_ref.get()
                if not project_snap.exists:
                     session_data = doc.to_dict()
                     await project_ref.set({
                        'id': session_id,
                        'name': session_data.get('title', 'Progetto Recuperato'),
                        'userId': session_data.get('userId', user_id or 'unknown'),
                        'createdAt': session_data.get('createdAt', async_firestore.SERVER_TIMESTAMP),
                        'updatedAt': async_firestore.SERVER_TIMESTAMP,
                        'expireAt': expire_at,
                        'status': 'active'
                    })
                     logger.info(f"[Repo] 🚀 Sync: Backfilled missing project {session_id}")
                
        except Exception as e:
            logger.error(f"[Repo] Error ensuring session: {str(e)}", exc_info=True)

    async def save_file_metadata(
        self,
        project_id: str,
        file_data: Dict[str, Any]
    ) -> None:
        """
        Save file metadata to the project's 'files' subcollection.
        """
        try:
            db = self._get_async_db()
            
            files_ref = db.collection('projects').document(project_id).collection('files')
            
            # Check for existing
            existing_docs = await files_ref.where('url', '==', file_data['url']).limit(1).get()
            if len(existing_docs) > 0:
                logger.debug(f"[Repo] File already exists: {file_data.get('name')}")
                return

            doc_data = {
                'url': file_data['url'],
                'type': file_data.get('type', 'image'),
                'name': file_data.get('name', f"File {datetime.now().isoformat()}"),
                'size': file_data.get('size', 0),
                'uploadedBy': file_data.get('uploadedBy', 'system'),
                'uploadedAt': async_firestore.SERVER_TIMESTAMP,
                'mimeType': file_data.get('mimeType', 'application/octet-stream'),
                'metadata': file_data.get('metadata', {}),
                'thumbnailUrl': file_data.get('thumbnailUrl')
            }
            
            await files_ref.add(doc_data)
            logger.info(f"[Repo] 🖼️ Saved file metadata: {doc_data['name']}")
            
            # Trigger sync (Coupled for now)
            await sync_project_cover(project_id)
            
        except Exception as e:
            logger.error(f"[Repo] Error saving file metadata: {str(e)}", exc_info=True)

    def get_history_sync(self, session_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        """
        SYNCHRONOUS retrieval for legacy wrappers.
        """
        try:
            db = self._get_db()
            
            messages_ref = (
                db.collection('sessions')
                .document(session_id)
                .collection('messages')
                .order_by('timestamp', direction=sync_firestore.Query.DESCENDING)
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
