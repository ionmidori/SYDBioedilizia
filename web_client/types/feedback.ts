/**
 * Feedback types — Golden Sync with backend_python/src/schemas/feedback.py.
 *
 * Used by MessageFeedback component to collect user ratings (thumbs up/down)
 * and feed the self-correction loop (evaluating-adk-agents skill).
 */

export interface FeedbackRequest {
    session_id: string;
    message_id: string;
    rating: -1 | 0 | 1;
    comment?: string;
}

export interface FeedbackResponse {
    status: string;
    feedback_id: string;
}
