"""
Email platform endpoints that are NOT called by users (Phase 128 — Fase 4).

- POST /internal/email/sweep — Cloud Scheduler, every 5 minutes, with an OIDC
  ID token signed by a dedicated service account. The token's audience and
  email are verified (fail closed when not configured). Re-dispatches due
  outbox entries and expired leases.
- POST /webhooks/email/brevo — Brevo delivery events, `Authorization: Bearer
  <BREVO_WEBHOOK_TOKEN>` compared in constant time. Unknown message ids are
  acknowledged (200) so Brevo does not retry them forever.

Both paths are exempt from App Check (machines, not the web app) and carry
their own authentication.
"""
from __future__ import annotations

import asyncio
import logging
from collections.abc import Mapping
from typing import Any

import google.auth.transport.requests
import google.oauth2.id_token
from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse
from src.core.config import settings
from src.core.exceptions import AuthError, ServiceError
from src.core.rate_limit import limiter
from src.db.firebase_client import get_async_firestore_client
from src.services.email import get_email_provider, outbox
from src.services.email.brevo import parse_webhook, verify_webhook_token

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Email platform"])


def _verify_scheduler_token(authorization: str | None) -> None:
    """Google-signed OIDC token from the configured Scheduler service account."""
    audience = settings.EMAIL_SWEEP_AUDIENCE
    invoker = settings.EMAIL_SWEEP_INVOKER_EMAIL
    if not audience or not invoker:
        raise ServiceError(message="Email sweep is not configured.", error_code="EMAIL_SWEEP_DISABLED", status_code=503)
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthError("Missing scheduler token.")
    token = authorization[len("Bearer ") :].strip()
    try:
        claims: Mapping[str, Any] = google.oauth2.id_token.verify_oauth2_token(
            token, google.auth.transport.requests.Request(), audience=audience
        )
    except ValueError as exc:
        raise AuthError("Invalid scheduler token.") from exc
    if claims.get("email") != invoker or not claims.get("email_verified"):
        raise AuthError("Scheduler token from an unexpected identity.")


@router.post("/internal/email/sweep")
@limiter.limit("30/minute")
async def sweep_outbox(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    authorization: str | None = Header(None),
) -> dict[str, int]:
    await asyncio.to_thread(_verify_scheduler_token, authorization)
    counts = await outbox.sweep(get_async_firestore_client(), get_email_provider())
    if any(counts.get(k) for k in ("sent", "retry", "dead")):
        logger.info("[Email/Sweep] Outbox swept.", extra=counts)
    return counts


@router.post("/webhooks/email/brevo")
@limiter.limit("300/minute")
async def brevo_webhook(
    request: Request,
    authorization: str | None = Header(None),
) -> JSONResponse:
    if not verify_webhook_token(authorization):
        logger.warning("[Email/Webhook] Rejected Brevo call (bad or missing token).")
        return JSONResponse(status_code=401, content={"error_code": "UNAUTHORIZED"})
    try:
        payload = await request.json()
    except ValueError:
        return JSONResponse(status_code=400, content={"error_code": "INVALID_JSON"})
    events = parse_webhook(payload)
    applied = await outbox.apply_events(get_async_firestore_client(), events)
    return JSONResponse(status_code=200, content={"received": len(events), "applied": applied})
