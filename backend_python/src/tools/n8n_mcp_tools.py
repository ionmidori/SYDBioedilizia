"""
n8n MCP Tools: Webhook-based integration between FastAPI backend and n8n workflows.

Architecture:
    - FastAPI (Tier 3) → HTTP POST → n8n Webhook Trigger → n8n automation
    - n8n acts as an automation hub: sends emails, Telegram messages, Notion updates, etc.
    - Pattern: Tier 3 calls n8n webhooks. n8n NEVER calls business logic directly.

n8n Setup:
    1. In n8n, create a workflow with a "Webhook" trigger node.
    2. Copy the Webhook URL and add to .env as N8N_WEBHOOK_NOTIFY_ADMIN / N8N_WEBHOOK_DELIVER_QUOTE.
    3. Set N8N_API_KEY for header auth (recommended in production).
    4. Set N8N_WEBHOOK_HMAC_SECRET for request signing (required in production).
       Generate with: python -c "import secrets; print(secrets.token_hex(32))"
    5. Set N8N_ALLOWED_WEBHOOK_HOSTS to restrict webhook destinations (SSRF guard).
       Example: "n8n.sydbioedilizia.com,n8n-staging.sydbioedilizia.com"

n8n Signature Verification (in n8n Code node):
    const timestamp = $input.headers['x-n8n-timestamp'];
    const sig = $input.headers['x-n8n-signature'];
    const body = JSON.stringify($input.body);  // Must match exact serialization
    const expected = 'sha256=' + crypto.createHmac('sha256', SECRET)
        .update(`${timestamp}.${body}`).digest('hex');
    if (sig !== expected) throw new Error('Invalid signature');
"""

import hashlib
import hmac
import json
import logging
import time
import uuid
from typing import Optional
from urllib.parse import urlparse

import httpx
from pydantic import BaseModel, Field
from langchain_core.tools import StructuredTool
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from src.core.config import settings

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# Retry helper: exponential backoff for n8n
# ─────────────────────────────────────────────

_HTTP_RETRYABLE = (httpx.TimeoutException, httpx.ConnectError, httpx.NetworkError)


def _validate_webhook_url(url: str) -> None:
    """
    SSRF prevention: validates webhook URL against the N8N_ALLOWED_WEBHOOK_HOSTS allowlist.
    Raises ValueError if the host is not in the allowlist (when configured).
    No-op if allowlist is not configured (logs a warning in that case).
    """
    allowed_hosts_raw = settings.N8N_ALLOWED_WEBHOOK_HOSTS
    if not allowed_hosts_raw:
        logger.warning(
            "[n8n] N8N_ALLOWED_WEBHOOK_HOSTS is not set — SSRF protection disabled. "
            "Configure this in production."
        )
        return
    allowed = {h.strip().lower() for h in allowed_hosts_raw.split(",") if h.strip()}
    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower()
    if hostname not in allowed:
        raise ValueError(
            f"[n8n] Webhook host '{hostname}' is not in N8N_ALLOWED_WEBHOOK_HOSTS allowlist. "
            "Update the allowlist or verify the webhook URL."
        )


def _sign_payload(body: str) -> tuple[str, str]:
    """
    Generates HMAC-SHA256 signature for webhook request signing (replay-attack prevention).
    Signing formula: HMAC-SHA256(secret, f"{unix_timestamp}.{body}")
    Returns (timestamp, hex_signature). Returns ("", "") if HMAC secret is not configured.
    """
    secret = settings.N8N_WEBHOOK_HMAC_SECRET
    if not secret:
        return "", ""
    timestamp = str(int(time.time()))
    message = f"{timestamp}.{body}"
    sig = hmac.new(secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()
    return timestamp, sig


def _make_headers(body: str) -> dict:
    """Build auth + HMAC signature headers for n8n webhook calls."""
    headers = {"Content-Type": "application/json"}
    if settings.N8N_API_KEY:
        headers["X-N8N-API-KEY"] = settings.N8N_API_KEY
    timestamp, sig = _sign_payload(body)
    if timestamp and sig:
        headers["X-N8N-Timestamp"] = timestamp
        headers["X-N8N-Signature"] = f"sha256={sig}"
    return headers


# ─────────────────────────────────────────────
# Tool 1: Notify Admin (new quote ready for review)
# ─────────────────────────────────────────────

class NotifyAdminInput(BaseModel):
    """Schema for notifying admin of a new quote draft awaiting review."""
    project_id: str = Field(..., description="ID of the project with the draft quote")
    estimated_value: float = Field(..., ge=0, description="Estimated grand total in EUR (VAT included)")
    client_name: Optional[str] = Field(None, description="Name of the client for the notification")
    urgency: str = Field(
        default="normal",
        description="Urgency level: 'low', 'normal', 'high'",
        pattern="^(low|normal|high)$"
    )


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(_HTTP_RETRYABLE),
    reraise=True
)
async def _call_n8n_webhook(url: str, payload: dict) -> dict:
    """
    Internal helper: calls an n8n webhook with HMAC signing, URL validation, and retry logic.
    Body is serialized to compact JSON before signing so the signature covers the exact bytes sent.
    """
    _validate_webhook_url(url)
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            url,
            content=body.encode("utf-8"),
            headers=_make_headers(body),
        )
        response.raise_for_status()
        return response.json() if response.content else {}


async def notify_admin_wrapper(
    project_id: str,
    estimated_value: float,
    client_name: Optional[str] = None,
    urgency: str = "normal"
) -> str:
    """
    Notifies the admin via n8n that a quote draft is ready for review.
    n8n handles: email alert, Telegram message, Notion task creation, etc.
    """
    webhook_url = settings.N8N_WEBHOOK_NOTIFY_ADMIN
    if not webhook_url:
        logger.warning("[n8n] N8N_WEBHOOK_NOTIFY_ADMIN not configured. Skipping notification.")
        return "⚠️ Admin notification skipped (N8N_WEBHOOK_NOTIFY_ADMIN not set)."

    payload = {
        "event": "quote_ready_for_review",
        "idempotency_key": f"{project_id}:quote_ready_for_review:{uuid.uuid4()}",
        "project_id": project_id,
        "estimated_value": round(estimated_value, 2),
        "client_name": client_name or "Unknown",
        "urgency": urgency,
        "review_url": f"{settings.ADMIN_DASHBOARD_URL}/quotes/{project_id}",
    }

    try:
        result = await _call_n8n_webhook(webhook_url, payload)
        logger.info(f"[n8n] Admin notified for project {project_id}. n8n response: {result}")
        return f"✅ Admin notificato per il progetto {project_id} (valore stimato: €{estimated_value:.2f})"
    except ValueError as e:
        logger.error(f"[n8n] Admin notify blocked — config error: {e}")
        return f"❌ Notifica admin bloccata (configurazione non valida): {e}"
    except httpx.HTTPStatusError as e:
        logger.error(f"[n8n] Admin notify failed — HTTP {e.response.status_code}: {e.response.text}")
        return f"❌ Notifica admin fallita (HTTP {e.response.status_code}). Ritentare."
    except Exception as e:
        logger.error(f"[n8n] Admin notify unexpected error: {e}", exc_info=True)
        return f"❌ Errore inatteso nella notifica admin: {str(e)}"


notify_admin = StructuredTool.from_function(
    coroutine=notify_admin_wrapper,
    name="notify_admin",
    description=(
        "Notifies the admin via n8n that a new quote draft is ready for review. "
        "Use AFTER suggest_quote_items has saved the draft to Firestore. "
        "n8n handles email/Telegram/Notion notifications automatically."
    ),
    args_schema=NotifyAdminInput
)


# ─────────────────────────────────────────────
# Tool 2: Deliver Quote (send approved quote to client)
# ─────────────────────────────────────────────

class DeliverQuoteInput(BaseModel):
    """Schema for delivering an approved quote to the client."""
    project_id: str = Field(..., description="ID of the project with the approved quote")
    client_email: str = Field(..., description="Client's email address to send the PDF to")
    pdf_url: str = Field(..., description="Signed Firebase Storage URL of the generated PDF")
    quote_total: float = Field(..., ge=0, description="Final grand total in EUR (for email subject)")
    delivery_channel: str = Field(
        default="email",
        description="Delivery channel: 'email', 'whatsapp', or 'both'",
        pattern="^(email|whatsapp|both)$"
    )


async def deliver_quote_wrapper(
    project_id: str,
    client_email: str,
    pdf_url: str,
    quote_total: float,
    delivery_channel: str = "email"
) -> str:
    """
    Delivers the approved PDF quote to the client via n8n automation.
    n8n handles: email with PDF attachment, WhatsApp message, CRM update, etc.
    """
    webhook_url = settings.N8N_WEBHOOK_DELIVER_QUOTE
    if not webhook_url:
        logger.warning("[n8n] N8N_WEBHOOK_DELIVER_QUOTE not configured. Skipping delivery.")
        return "⚠️ Quote delivery skipped (N8N_WEBHOOK_DELIVER_QUOTE not set)."

    payload = {
        "event": "quote_approved_deliver",
        "idempotency_key": f"{project_id}:quote_approved_deliver:{uuid.uuid4()}",
        "project_id": project_id,
        "client_email": client_email,
        "pdf_url": pdf_url,
        "quote_total": round(quote_total, 2),
        "delivery_channel": delivery_channel,
    }

    try:
        result = await _call_n8n_webhook(webhook_url, payload)
        logger.info(f"[n8n] Quote delivered for project {project_id} via {delivery_channel}. Response: {result}")
        return (
            f"✅ Preventivo inviato a {client_email} via {delivery_channel} "
            f"(totale: €{quote_total:.2f}, progetto: {project_id})"
        )
    except ValueError as e:
        logger.error(f"[n8n] Quote delivery blocked — config error: {e}")
        return f"❌ Consegna preventivo bloccata (configurazione non valida): {e}"
    except httpx.HTTPStatusError as e:
        logger.error(f"[n8n] Quote delivery failed — HTTP {e.response.status_code}: {e.response.text}")
        return f"❌ Consegna preventivo fallita (HTTP {e.response.status_code}). Riprovare."
    except Exception as e:
        logger.error(f"[n8n] Quote delivery unexpected error: {e}", exc_info=True)
        return f"❌ Errore inatteso nella consegna preventivo: {str(e)}"


deliver_quote = StructuredTool.from_function(
    coroutine=deliver_quote_wrapper,
    name="deliver_quote",
    description=(
        "Delivers an approved quote PDF to the client via n8n (email/WhatsApp). "
        "Use ONLY after admin has approved the quote and the PDF has been generated. "
        "Requires a valid Firebase Storage signed URL for the PDF."
    ),
    args_schema=DeliverQuoteInput
)
