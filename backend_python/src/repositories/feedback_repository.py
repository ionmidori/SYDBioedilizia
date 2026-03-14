"""
Firestore repository for user feedback on chat messages.

Schema: sessions/{sessionId}/feedback/{feedbackId}
Fields: message_id, rating, comment, created_at, user_id

Pattern: repositories/conversation_repository.py (same Firestore client singleton).
"""
import logging
from datetime import datetime, timezone
from typing import Optional

from src.db.firebase_client import get_async_firestore_client

logger = logging.getLogger(__name__)


class FeedbackRepository:
    """Persists user feedback (thumbs up/down) to Firestore."""

    async def save_feedback(
        self,
        session_id: str,
        message_id: str,
        rating: int,
        user_id: Optional[str] = None,
        comment: Optional[str] = None,
    ) -> str:
        """
        Save a feedback document to Firestore.

        Returns the auto-generated document ID.
        Idempotent: if user rates same message twice, both are stored
        (latest wins in aggregation queries).
        """
        db = get_async_firestore_client()

        doc_data = {
            "message_id": message_id,
            "rating": rating,
            "comment": comment or "",
            "user_id": user_id or "",
            "created_at": datetime.now(timezone.utc),
        }

        feedback_ref = (
            db.collection("sessions")
            .document(session_id)
            .collection("feedback")
        )

        _, doc_ref = await feedback_ref.add(doc_data)

        logger.info(
            "[Feedback] Saved.",
            extra={
                "session_id": session_id,
                "message_id": message_id,
                "rating": rating,
                "feedback_id": doc_ref.id,
            },
        )
        return doc_ref.id

    async def get_negative_feedback(
        self,
        limit: int = 50,
    ) -> list[dict]:
        """
        Retrieve recent negative feedback across all sessions.
        Used by admin dashboard for self-correction analysis.
        """
        db = get_async_firestore_client()

        # Collection group query across all sessions/*/feedback
        query = (
            db.collection_group("feedback")
            .where("rating", "==", -1)
            .order_by("created_at", direction="DESCENDING")
            .limit(limit)
        )

        docs = []
        async for doc in query.stream():
            data = doc.to_dict()
            data["feedback_id"] = doc.id
            # Extract session_id from document path: sessions/{sid}/feedback/{fid}
            data["session_id"] = doc.reference.parent.parent.id
            docs.append(data)

        return docs
