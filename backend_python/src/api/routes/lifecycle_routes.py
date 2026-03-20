"""
Account Lifecycle Routes — internal endpoint for Cloud Scheduler.

POST /internal/lifecycle/run
  Triggered by a Cloud Scheduler job (daily). Runs all 3 GDPR inactivity phases:
    Phase 1 (12 mo) → warning email
    Phase 2 (13 mo) → Firebase Auth disabled
    Phase 3 (24 mo) → PII anonymized + Auth deleted

Security:
  - Protected by X-Lifecycle-Secret header (shared secret, stored in Cloud Scheduler job config)
  - NOT protected by Firebase App Check (called server-to-server, no browser token)
  - NOT in the public API surface (prefix: /internal)

Deployment:
  Cloud Scheduler → POST https://api.sydbioedilizia.com/internal/lifecycle/run
  Headers: { "X-Lifecycle-Secret": "<LIFECYCLE_SECRET env var>" }
  Schedule: every day at 03:00 Europe/Rome (low-traffic window)
"""
from __future__ import annotations

import logging
import secrets

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

from src.core.config import settings
from src.services.account_lifecycle_service import get_account_lifecycle_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal", tags=["Internal"])


class LifecycleRunResponse(BaseModel):
    status: str
    warned: int
    disabled: int
    anonymized: int
    errors: list[str]


@router.post(
    "/lifecycle/run",
    response_model=LifecycleRunResponse,
    summary="Run GDPR account lifecycle pass (Cloud Scheduler only)",
)
async def run_lifecycle(
    x_lifecycle_secret: str | None = Header(None, alias="X-Lifecycle-Secret"),
) -> LifecycleRunResponse:
    """
    Runs the 3-phase GDPR inactivity lifecycle pipeline.

    Protected by X-Lifecycle-Secret header. Designed to be called by
    Cloud Scheduler once per day at low-traffic hours.

    Returns counts of users processed per phase and any error details.
    """
    # ── Auth: constant-time compare to prevent timing attacks ─────────────────
    expected = settings.LIFECYCLE_SECRET
    if not expected:
        # Secret not configured → refuse to run (prevents accidental open access)
        logger.error("[Lifecycle] LIFECYCLE_SECRET is not configured — aborting.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Lifecycle endpoint is not configured.",
        )

    if not x_lifecycle_secret or not secrets.compare_digest(
        x_lifecycle_secret.encode(), expected.encode()
    ):
        logger.warning("[Lifecycle] Unauthorized lifecycle run attempt (bad secret).")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Lifecycle-Secret header.",
        )

    # ── Run pipeline ──────────────────────────────────────────────────────────
    logger.info("[Lifecycle] Starting scheduled lifecycle pass.")
    service = get_account_lifecycle_service()
    result = await service.run_lifecycle_pass()

    return LifecycleRunResponse(
        status="ok" if not result.errors else "partial_errors",
        warned=result.warned,
        disabled=result.disabled,
        anonymized=result.anonymized,
        errors=result.errors,
    )
