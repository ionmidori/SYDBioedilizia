"""
Feedback schemas — Golden Sync with web_client/types/feedback.ts.

Captures user ratings (thumbs up/down) on assistant messages for
self-correction loop (see evaluating-adk-agents skill).
"""
from pydantic import BaseModel, Field
from typing import Optional


class FeedbackRequest(BaseModel):
    """Incoming feedback from client UI."""
    model_config = {"extra": "forbid"}

    session_id: str = Field(..., min_length=1, description="Chat session ID")
    message_id: str = Field(..., min_length=1, description="ID of the rated message")
    rating: int = Field(..., ge=-1, le=1, description="-1 = negative, 0 = neutral, 1 = positive")
    comment: Optional[str] = Field(
        None,
        max_length=1000,
        description="Optional free-text comment from user",
    )


class FeedbackResponse(BaseModel):
    """Response confirming feedback was saved."""
    status: str = "ok"
    feedback_id: str = Field(..., description="Firestore document ID of saved feedback")
