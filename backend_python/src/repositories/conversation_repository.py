import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from firebase_admin import firestore
from src.db.firebase_client import get_firestore_client
from src.db.projects import sync_project_cover

logger = logging.getLogger(__name__)

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
        return get_firestore_client()

    async def save_message(
        self,
        session_id: str,
        role: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
        tool_calls: Optional[List[Dict[str, Any]]] = None,
        tool_call_id: Optional[str] = None,
        attachments: Optional[List[Dict[str, Any]]] = None
    ) -> None:
        """Save a message to Firestore with tool support and media attachments."""
        try:
            db = self._get_db()
            
            # 🛡️ Defense: Ensure Pydantic models are dumped
            if tool_calls:
                tool_calls = [tc.model_dump() if hasattr(tc, 'model_dump') else tc for tc in tool_calls]
            
            if attachments:
                attachments = [att.model_dump() if hasattr(att, 'model_dump') else att for att in attachments]

            message_data = {
                'role': role,
                'content': content,
                'timestamp': firestore.SERVER_TIMESTAMP,
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
            db.collection('sessions').document(session_id).collection('messages').add(message_data)
            
            # Update session metadata
            session_ref = db.collection('sessions').document(session_id)
            session_doc = session_ref.get()
            
            session_update = {
                'updatedAt': firestore.SERVER_TIMESTAMP,
                'sessionId': session_id,
                'messageCount': firestore.Increment(1)
            }
            
            if not session_doc.exists:
                session_update['createdAt'] = firestore.SERVER_TIMESTAMP
                
            session_ref.set(session_update, merge=True)
            
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
            db = self._get_db()
            
            messages_ref = (
                db.collection('sessions')
                .document(session_id)
                .collection('messages')
                .order_by('timestamp', direction=firestore.Query.DESCENDING)
                .limit(limit)
            )
            
            docs = messages_ref.stream()
            
            messages_reversed = []
            for doc in docs:
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
            db = self._get_db()
            
            session_ref = db.collection('sessions').document(session_id)
            doc = session_ref.get()
            
            if not doc.exists:
                # Determine owner
                owner_id = user_id if user_id else f"guest_{session_id[:8]}"
                
                session_ref.set({
                    'sessionId': session_id,
                    'userId': owner_id,
                    'title': 'Nuovo Progetto',
                    'status': 'draft',
                    'thumbnailUrl': None,
                    'createdAt': firestore.SERVER_TIMESTAMP,
                    'updatedAt': firestore.SERVER_TIMESTAMP,
                    'messageCount': 0
                })
                logger.info(f"[Repo] Created new session {session_id} for user {owner_id}")
                
                # Sync to Projects collection
                project_ref = db.collection('projects').document(session_id)
                if not project_ref.get().exists:
                    project_ref.set({
                        'id': session_id,
                        'name': 'Nuovo Progetto', 
                        'userId': owner_id,
                        'createdAt': firestore.SERVER_TIMESTAMP,
                        'updatedAt': firestore.SERVER_TIMESTAMP,
                        'status': 'active'
                    })
                    logger.info(f"[Repo] 🚀 Sync: Created project {session_id} from session")
            else:
                # 🔄 Session Claiming Logic: If existing session is a guest one, and we have a real user, upgrade it.
                session_data = doc.to_dict()
                current_owner = session_data.get('userId', '')
                if user_id and current_owner.startswith('guest_'):
                    session_ref.update({'userId': user_id, 'updatedAt': firestore.SERVER_TIMESTAMP})
                    # Also update project
                    project_ref = db.collection('projects').document(session_id)
                    if project_ref.get().exists:
                        project_ref.update({'userId': user_id, 'updatedAt': firestore.SERVER_TIMESTAMP})
                    logger.info(f"[Repo] 🔄 CLAIM: Session {session_id} migrated from {current_owner} to {user_id}")
                
                # Backfill check
                project_ref = db.collection('projects').document(session_id)
                if not project_ref.get().exists:
                     session_data = doc.to_dict()
                     project_ref.set({
                        'id': session_id,
                        'name': session_data.get('title', 'Progetto Recuperato'), 
                        'userId': session_data.get('userId', user_id or 'unknown'),
                        'createdAt': session_data.get('createdAt', firestore.SERVER_TIMESTAMP),
                        'updatedAt': firestore.SERVER_TIMESTAMP,
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
            db = self._get_db()
            
            files_ref = db.collection('projects').document(project_id).collection('files')
            
            # Check for existing
            existing_docs = files_ref.where('url', '==', file_data['url']).limit(1).get()
            if len(existing_docs) > 0:
                logger.debug(f"[Repo] File already exists: {file_data.get('name')}")
                return

            doc_data = {
                'url': file_data['url'],
                'type': file_data.get('type', 'image'),
                'name': file_data.get('name', f"File {datetime.now().isoformat()}"),
                'size': file_data.get('size', 0),
                'uploadedBy': file_data.get('uploadedBy', 'system'),
                'uploadedAt': firestore.SERVER_TIMESTAMP,
                'mimeType': file_data.get('mimeType', 'application/octet-stream'),
                'metadata': file_data.get('metadata', {}),
                'thumbnailUrl': file_data.get('thumbnailUrl')
            }
            
            files_ref.add(doc_data)
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
                .order_by('timestamp', direction=firestore.Query.DESCENDING)
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
