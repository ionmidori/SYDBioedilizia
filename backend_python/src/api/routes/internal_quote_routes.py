"""
Internal Quote Approval Route — server-to-server trigger for the Streamlit
admin console.

POST /internal/quote/approve
  Runs the same approve/reject pipeline as POST /api/quote/{id}/approve
  (PDF generation + client delivery on approve), but for a caller that has
  no Firebase ID token: the admin console authenticates its own operators
  with streamlit-authenticator, not Firebase Auth.

Security:
  - Protected by X-Admin-Internal-Secret header (shared secret, distinct
    from LIFECYCLE_SECRET so a leak of one does not grant the other's action)
  - NOT protected by Firebase App Check (called server-to-server, no browser token)
  - NOT in the public API surface (prefix: /internal)
  - project_id travels in the BODY, not the path: the App Check middleware
    whitelist matches on exact path strings (see main.py AppCheckMiddleware),
    so this route — like /internal/lifecycle/run — has no path parameters.

Deployment:
  admin_tool (Streamlit) → POST {BACKEND_URL}/internal/quote/approve
  Headers: { "X-Admin-Internal-Secret": "<ADMIN_INTERNAL_SECRET env var>" }
"""
from __future__ import annotations

import logging
import secrets
from typing import Literal

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field
from src.api.routes.quote_routes import ApproveQuoteResponse, _run_quote_approval
from src.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal/quote", tags=["Internal"])


class InternalApproveBody(BaseModel):
    model_config = {"extra": "forbid"}

    project_id: str = Field(..., min_length=1, max_length=128, pattern=r"^[a-zA-Z0-9_-]+$")
    decision: Literal["approve", "reject"] = Field(
        ..., description="'approve' triggers PDF generation + client delivery, 'reject' ends the flow."
    )
    notes: str = Field(default="", max_length=2000)
    reviewed_by: str = Field(
        ..., min_length=1, max_length=128,
        description="Identifier of the admin console operator (e.g. streamlit-authenticator username). "
                    "No Firebase uid exists for this caller — stored as-is in the audit trail.",
    )


@router.post(
    "/approve",
    response_model=ApproveQuoteResponse,
    summary="Admin console: approve/reject a quote (server-to-server, shared secret)",
)
async def internal_approve_quote(
    body: InternalApproveBody,
    x_admin_internal_secret: str | None = Header(None, alias="X-Admin-Internal-Secret"),
) -> ApproveQuoteResponse:
    """Same pipeline as POST /api/quote/{id}/approve — see _run_quote_approval."""
    # ── Auth: constant-time compare to prevent timing attacks ─────────────────
    expected = settings.ADMIN_INTERNAL_SECRET
    if not expected:
        logger.error("[InternalQuote] ADMIN_INTERNAL_SECRET is not configured — aborting.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Internal quote approval endpoint is not configured.",
        )

    if not x_admin_internal_secret or not secrets.compare_digest(
        x_admin_internal_secret.encode(), expected.encode()
    ):
        logger.warning("[InternalQuote] Unauthorized internal approve attempt (bad secret).")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Admin-Internal-Secret header.",
        )

    return await _run_quote_approval(
        body.project_id, body.decision, body.notes, body.reviewed_by
    )
