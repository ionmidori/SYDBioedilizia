"""
Chat History API Router.

Provides endpoints for fetching chat message history from sessions.
"""
import logging
from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
import json
from firebase_admin import firestore

from src.auth.jwt_handler import verify_token
from src.schemas.internal import UserSession
from src.db.firebase_client import get_firestore_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class MessageResponse(BaseModel):
    """Individual message in chat history."""
    id: str
    role: str
    content: str
    timestamp: Optional[str] = None
    attachments: Optional[list] = None  # Fixed: was dict, should be list to match Firestore data
    tool_calls: Optional[list] = None


class ChatHistoryResponse(BaseModel):
    """Response model for chat history."""
    messages: List[MessageResponse]
    has_more: bool
    next_cursor: Optional[str] = None


@router.get("/{session_id}/messages", response_model=ChatHistoryResponse)
async def get_chat_history(
    session_id: str,
    limit: int = Query(default=50, ge=1, le=100),
    cursor: Optional[str] = Query(default=None),
    user_session: UserSession = Depends(verify_token),
) -> ChatHistoryResponse:
    """
    Fetch chat history for a session.
    
    Args:
        session_id: The session ID to fetch messages from
        limit: Maximum number of messages to return (1-100)
        cursor: Optional cursor for pagination (message ID to start after)
        user_session: JWT verified user session
        
    Returns:
        ChatHistoryResponse with messages and pagination info
        
    Raises:
        HTTPException: If session not found or access denied
    """
    try:
        db = get_firestore_client()
        user_id = user_session.uid
        
        # 🛡️ SECURITY: Verify user owns this session
        session_ref = db.collection('sessions').document(session_id)
        session_doc = session_ref.get()
        
        if not session_doc.exists:
            # If session doesn't exist, it's a "fresh" session.
            # We return empty messages instead of 404 to prevent UI crashes.
            logger.info(f"[ChatHistory] Session {session_id} not found. Returning empty history.")
            return ChatHistoryResponse(messages=[], has_more=False)
        
        session_data = session_doc.to_dict()
        session_owner = session_data.get('userId', '')
        
        # Allow access if user owns the session OR if it's an anonymous session they created
        if session_owner != user_id and not session_owner.startswith('guest_'):
            logger.warning(
                f"[ChatHistory] Access denied: User '{user_id}' "
                f"tried to access session '{session_id}' owned by '{session_owner}'"
            )
            raise HTTPException(status_code=403, detail="Access denied to this session")
        
        # Build query
        messages_ref = (
            db.collection('sessions')
            .document(session_id)
            .collection('messages')
            .order_by('timestamp', direction=firestore.Query.ASCENDING)
        )
        
        # Apply cursor-based pagination
        if cursor:
            cursor_doc = db.collection('sessions').document(session_id).collection('messages').document(cursor).get()
            if cursor_doc.exists:
                messages_ref = messages_ref.start_after(cursor_doc)
        
        # Fetch one extra to check for more
        messages_ref = messages_ref.limit(limit + 1)
        docs = list(messages_ref.stream())
        
        # Check if there are more messages
        has_more = len(docs) > limit
        if has_more:
            docs = docs[:limit]  # Remove the extra document
        
        # Build response
        messages = []
        last_id = None
        
        for doc in docs:
            data = doc.to_dict()
            last_id = doc.id
            
            # Convert timestamp
            timestamp_val = data.get('timestamp')
            timestamp_str = None
            if timestamp_val:
                if isinstance(timestamp_val, str):
                    timestamp_str = timestamp_val
                elif hasattr(timestamp_val, 'isoformat'):
                    timestamp_str = timestamp_val.isoformat()
            
            # Robust extraction of lists (handles legacy dicts or None)
            attachments_val = data.get('attachments')
            if attachments_val and not isinstance(attachments_val, list):
                if isinstance(attachments_val, dict):
                    # Legacy: convert dict values to list or wrap? 
                    # Assuming it might be a map of url->meta, we arguably just drop it or try to recover.
                    # Safest is to treat as None to avoid 500, or empty list.
                    logger.warning(f"Found non-list attachments for msg {doc.id}: {type(attachments_val)}")
                    attachments_val = [] 
                else:
                    attachments_val = []
            elif attachments_val is None:
                attachments_val = []

            tool_calls_val = data.get('tool_calls')
            if tool_calls_val and not isinstance(tool_calls_val, list):
                tool_calls_val = []
            elif tool_calls_val is None:
                tool_calls_val = []
            
            # Robust content extraction
            content_val = data.get('content', '')
            if isinstance(content_val, list) or isinstance(content_val, dict):
                # If content is structured (e.g. agent output), stringify it for now
                # Ideally we'd have a schema for this, but to prevent 500s we cast to str
                try:
                    content_val = json.dumps(content_val)
                except Exception:
                    content_val = str(content_val)
            elif content_val is None:
                content_val = ""
            
            messages.append(MessageResponse(
                id=doc.id,
                role=data.get('role', 'user'),
                content=str(content_val),
                timestamp=timestamp_str,
                attachments=attachments_val,
                tool_calls=tool_calls_val
            ))
        
        logger.info(f"[ChatHistory] Retrieved {len(messages)} messages for session {session_id}")
        
        return ChatHistoryResponse(
            messages=messages,
            has_more=has_more,
            next_cursor=last_id if has_more else None
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ChatHistory] Error fetching history: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch chat history")
