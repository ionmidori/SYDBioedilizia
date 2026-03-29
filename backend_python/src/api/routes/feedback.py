"""
Feedback API router — collects user ratings on chat messages.

POST /feedback → saves thumbs up/down to Firestore.
Used by the self-correction loop (evaluating-adk-agents skill).
"""
import logging

from fastapi import APIRouter, Depends

from src.auth.jwt_handler import verify_token
from src.schemas.feedback import FeedbackRequest, FeedbackResponse
from src.schemas.internal import UserSession
from src.repositories.feedback_repository import FeedbackRepository
from src.core.exceptions import AppException

logger = logging.getLogger(__name__)

feedback_router = APIRouter(prefix="/feedback", tags=["feedback"])

_feedback_repo = FeedbackRepository()


@feedback_router.post("", response_model=FeedbackResponse)
async def submit_feedback(
    body: FeedbackRequest,
    user_session: UserSession = Depends(verify_token),
) -> FeedbackResponse:
    """
    Save user feedback (thumbs up/down) for a chat message.

    Requires authentication (any user — anonymous or authenticated).
    Rate: no rate-limit (low-volume endpoint).
    """
    try:
        feedback_id = await _feedback_repo.save_feedback(
            session_id=body.session_id,
            message_id=body.message_id,
            rating=body.rating,
            user_id=user_session.uid,
            comment=body.comment,
        )
    except Exception as exc:
        logger.error("[Feedback] Failed to save.", exc_info=True)
        raise AppException(
            status_code=500,
            error_code="FEEDBACK_SAVE_ERROR",
            message="Impossibile salvare il feedback. Riprova.",
        ) from exc

    return FeedbackResponse(feedback_id=feedback_id)
