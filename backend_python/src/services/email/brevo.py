"""
Brevo (EU) transactional email provider + webhook parsing (Phase 128 — Fase 4).

Off until the owner has a verified sending domain: select it with
EMAIL_PROVIDER=brevo and set BREVO_API_KEY / BREVO_WEBHOOK_TOKEN in Secret
Manager. Webhooks authenticate with a Bearer token configured on the Brevo
webhook ("Secured webhooks" → bearer) and are compared in constant time.

Send API: POST https://api.brevo.com/v3/smtp/email (201 → {"messageId"}).
Webhook payload: {"event", "message-id", "ts_event" (UTC epoch s), "X-Mailin-custom", ...}.
"""
from __future__ import annotations

import base64
import hmac
import logging
from datetime import UTC, datetime
from typing import Any

import httpx

from src.core.config import settings
from src.services.email.types import DeliveryEvent, DeliveryEventType, OutboundEmail, ProviderError, ProviderResult

logger = logging.getLogger(__name__)

BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email"

# Brevo event name → our delivery event (None = recorded nowhere, ignored).
_EVENT_MAP: dict[str, DeliveryEventType | None] = {
    "delivered": "delivered",
    "hard_bounce": "bounced",
    "invalid_email": "bounced",
    "blocked": "bounced",
    "soft_bounce": "soft_bounced",
    "spam": "complained",
    "deferred": "deferred",
    "error": "failed",
    "opened": "opened",
    "unique_opened": "opened",
    "request": None,  # "sent" — we already know it from the API response
    "click": None,
    "proxy_open": None,
    "unique_proxy_open": None,
    "unsubscribed": None,
}


class BrevoProvider:
    name = "brevo"

    def __init__(self, api_key: str | None = None, client: httpx.AsyncClient | None = None) -> None:
        self._api_key = api_key or settings.BREVO_API_KEY
        self._client = client

    def _payload(self, email: OutboundEmail) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "sender": {"name": settings.email_from_name, "email": settings.email_from_address},
            "to": [{"email": email.to}],
            "replyTo": {"email": settings.email_reply_to},
            "subject": email.subject,
            "textContent": email.text,
        }
        if email.html:
            payload["htmlContent"] = email.html
        if email.cc:
            payload["cc"] = [{"email": cc} for cc in email.cc]
        if email.attachments:
            payload["attachment"] = [
                {"name": a.filename, "content": base64.b64encode(a.content).decode("ascii")}
                for a in email.attachments
            ]
        headers: dict[str, str] = {}
        if email.reference:
            headers["X-Mailin-custom"] = email.reference
        if email.list_unsubscribe:
            headers["List-Unsubscribe"] = f"<mailto:{email.list_unsubscribe}?subject=unsubscribe>"
        if headers:
            payload["headers"] = headers
        if email.tags:
            payload["tags"] = list(email.tags)
        return payload

    async def send(self, email: OutboundEmail) -> ProviderResult:
        if not self._api_key:
            raise ProviderError("Brevo is not configured (BREVO_API_KEY).", permanent=True)
        headers = {"api-key": self._api_key, "accept": "application/json", "content-type": "application/json"}
        try:
            if self._client is not None:
                response = await self._client.post(BREVO_SEND_URL, json=self._payload(email), headers=headers)
            else:
                async with httpx.AsyncClient(timeout=20.0) as client:
                    response = await client.post(BREVO_SEND_URL, json=self._payload(email), headers=headers)
        except httpx.HTTPError as exc:
            raise ProviderError("Brevo transport error.", extra={"type": type(exc).__name__}) from exc

        if response.status_code in (200, 201, 202):
            message_id = str((response.json() or {}).get("messageId") or "")
            if not message_id:
                raise ProviderError("Brevo accepted the email without a messageId.")
            logger.info("[Email/Brevo] Accepted.", extra={"reference": email.reference or "-"})
            return ProviderResult(provider=self.name, message_id=message_id)
        # 429 and 5xx are worth retrying; other 4xx (bad sender, invalid
        # address, bad key) will fail the same way every time.
        retryable = response.status_code == 429 or response.status_code >= 500
        raise ProviderError(
            f"Brevo answered {response.status_code}.", permanent=not retryable, status_code=response.status_code
        )


def verify_webhook_token(authorization: str | None) -> bool:
    """Constant-time check of `Authorization: Bearer <BREVO_WEBHOOK_TOKEN>`."""
    expected = settings.BREVO_WEBHOOK_TOKEN
    if not expected or not authorization or not authorization.startswith("Bearer "):
        return False
    return hmac.compare_digest(authorization[len("Bearer ") :].strip().encode(), expected.encode())


def _event_time(item: dict[str, Any]) -> datetime:
    """`ts_event` is UTC epoch seconds, `ts_epoch` UTC epoch milliseconds."""
    try:
        if item.get("ts_event") is not None:
            return datetime.fromtimestamp(float(item["ts_event"]), tz=UTC)
        if item.get("ts_epoch") is not None:
            return datetime.fromtimestamp(float(item["ts_epoch"]) / 1000.0, tz=UTC)
    except (TypeError, ValueError, OverflowError, OSError):
        pass
    return datetime.now(UTC)


def parse_webhook(payload: Any) -> list[DeliveryEvent]:
    """Brevo posts one event object (or a list when batched)."""
    items = payload if isinstance(payload, list) else [payload]
    events: list[DeliveryEvent] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        raw = str(item.get("event") or "")
        mapped = _EVENT_MAP.get(raw)
        message_id = str(item.get("message-id") or "")
        if mapped is None or not message_id:
            continue
        occurred = _event_time(item)
        events.append(
            DeliveryEvent(
                provider="brevo",
                message_id=message_id,
                event=mapped,
                occurred_at=occurred,
                detail=str(item.get("reason") or "")[:300],
                reference=item.get("X-Mailin-custom") or None,
                raw_event=raw,
            )
        )
    return events
