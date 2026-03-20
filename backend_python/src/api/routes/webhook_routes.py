"""
Inbound webhook routes for n8n -> FastAPI callbacks.

n8n calls these endpoints to report automation results back to FastAPI.
All endpoints require HMAC-SHA256 signature validation via verify_n8n_webhook.

Event types handled:
- quote_delivered: mark quote as delivered in Firestore
- batch_notification_sent: flag batch notification as sent
- automation_failed: log error (non-fatal, return 200)
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, ValidationError

from src.api.deps.webhook_auth import verify_n8n_webhook
from src.core.rate_limit import limiter
from src.db.firebase_client import get_async_firestore_client
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


# ── Request / Response Schemas ───────────────────────────────────────────────

class N8NWebhookEvent(BaseModel):
    model_config = {"extra": "forbid"}

    event_type: str = Field(..., min_length=1, max_length=100)
    project_id: str = Field(
        ..., min_length=1, max_length=128, pattern=r"^[a-zA-Z0-9_-]+$"
    )
    idempotency_key: str = Field(..., min_length=1, max_length=256)
    data: dict = Field(default_factory=dict)
    execution_id: str | None = Field(None, max_length=256)


class WebhookResponse(BaseModel):
    status: str
    event_type: str
    project_id: str


# ── Endpoint ─────────────────────────────────────────────────────────────────

@router.post(
    "/n8n",
    response_model=WebhookResponse,
    summary="Receive n8n automation callback",
)
@limiter.limit("30/minute")
async def receive_n8n_webhook(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    payload: dict = Depends(verify_n8n_webhook),
) -> WebhookResponse:
    """
    Receive and process an n8n automation callback event.
    HMAC-SHA256 signature is validated by the verify_n8n_webhook dependency.
    """
    # Parse and validate the payload
    try:
        event = N8NWebhookEvent(**payload)
    except ValidationError as exc:
        logger.warning(
            "[n8n callback] Payload validation failed: %s",
            exc.errors()[:3],
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook payload",
        )

    db = get_async_firestore_client()

    # ── Idempotency check ────────────────────────────────────────────────
    idem_ref = db.collection("webhook_events").document(event.idempotency_key)
    idem_doc = await idem_ref.get()
    if idem_doc.exists:
        logger.info(
            "[n8n callback] Duplicate event skipped",
            extra={
                "idempotency_key": event.idempotency_key,
                "event_type": event.event_type,
            },
        )
        return WebhookResponse(
            status="already_processed",
            event_type=event.event_type,
            project_id=event.project_id,
        )

    # ── Route by event_type ──────────────────────────────────────────────
    now = utc_now()

    if event.event_type == "quote_delivered":
        quote_ref = (
            db.collection("projects")
            .document(event.project_id)
            .collection("private_data")
            .document("quote")
        )
        await quote_ref.update({"status": "delivered", "delivered_at": now})

    elif event.event_type == "batch_notification_sent":
        batch_ref = db.collection("quote_batches").document(event.project_id)
        await batch_ref.update(
            {"notification_sent": True, "notification_sent_at": now}
        )

    elif event.event_type == "automation_failed":
        logger.error(
            "[n8n callback] Automation failed",
            extra={
                "project_id": event.project_id,
                "execution_id": event.execution_id,
                "data": event.data,
            },
        )

    else:
        logger.info(
            "[n8n callback] Unknown event_type: %s", event.event_type
        )

    # ── Write idempotency record ─────────────────────────────────────────
    await idem_ref.set({
        "processed_at": now,
        "event_type": event.event_type,
        "project_id": event.project_id,
        "execution_id": event.execution_id,
    })

    logger.info(
        "[n8n callback] Processed",
        extra={
            "event_type": event.event_type,
            "project_id": event.project_id,
            "idempotency_key": event.idempotency_key,
        },
    )

    return WebhookResponse(
        status="ok",
        event_type=event.event_type,
        project_id=event.project_id,
    )
