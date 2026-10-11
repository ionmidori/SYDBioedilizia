"""
Admin dashboard and GDPR monitor — /api/admin/kpis, /api/admin/gdpr/*
(Phase 128, Fase 6.1b).

The GDPR lifecycle pass (warn at 12 months, disable at 13, anonymise at 24) is
still run daily by Cloud Scheduler through `/internal/lifecycle/run`
(shared secret). The admin can also run it on demand here, with the admin
token: the secret never reaches a browser.
"""
from __future__ import annotations

import time
from collections import Counter

from fastapi import APIRouter, Depends, Request
from src.auth.admin import require_admin
from src.core.config import settings
from src.core.rate_limit import limiter
from src.db.firebase_client import get_async_firestore_client
from src.schemas.admin_content import AdminKpis, GdprPhase, GdprRunResult, GdprStatus
from src.schemas.internal import UserSession
from src.services.account_lifecycle_service import get_account_lifecycle_service
from src.services.admin_kpis import compute_kpis
from src.services.audit import AuditAction, AuditResourceType, emit_audit_event
from src.services.lifecycle_lock import lifecycle_lease
from src.utils.datetime_utils import utc_now

router = APIRouter(prefix="/api/admin", tags=["Admin — Dashboard"])

_KPI_TTL_SECONDS = 30.0
_kpi_cache: tuple[float, AdminKpis] | None = None


def sanitize_errors(errors: list[str]) -> list[str]:
    """Counts per phase only. The raw errors (`warn:<uid>:<exception text>`) can hold
    user ids or email addresses: they stay in the server logs."""
    per_phase = Counter(error.split(":", 1)[0].strip() or "errore" for error in errors)
    return [f"{phase}: {n} errori (dettagli nei log del server)" for phase, n in sorted(per_phase.items())]


@router.get("/kpis", response_model=AdminKpis)
@limiter.limit("60/minute")
async def get_kpis(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    admin: UserSession = Depends(require_admin),  # pyright: ignore[reportUnusedParameter]
) -> AdminKpis:
    """Counts per status, pending value, weekly approvals — cached for 30 s per instance."""
    global _kpi_cache
    cached = _kpi_cache
    if cached is not None and time.monotonic() - cached[0] < _KPI_TTL_SECONDS:
        return cached[1]
    kpis = await compute_kpis(get_async_firestore_client(), utc_now())
    _kpi_cache = (time.monotonic(), kpis)
    return kpis


@router.get("/gdpr/status", response_model=GdprStatus)
@limiter.limit("60/minute")
async def gdpr_status(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    admin: UserSession = Depends(require_admin),  # pyright: ignore[reportUnusedParameter]
) -> GdprStatus:
    return GdprStatus(
        phases=[
            GdprPhase(phase=1, months_inactive=settings.LIFECYCLE_WARN_MONTHS, action="Email di avviso inattività"),
            GdprPhase(phase=2, months_inactive=settings.LIFECYCLE_DISABLE_MONTHS, action="Account disabilitato"),
            GdprPhase(
                phase=3, months_inactive=settings.LIFECYCLE_ANONYMIZE_MONTHS, action="Dati personali anonimizzati"
            ),
        ],
        scheduler_secret_configured=bool(settings.LIFECYCLE_SECRET),
    )


@router.post("/gdpr/lifecycle/run", response_model=GdprRunResult)
@limiter.limit("3/hour")
async def run_gdpr_lifecycle(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    admin: UserSession = Depends(require_admin),
) -> GdprRunResult:
    """Run the inactivity pipeline now (it can take up to a minute on large user bases)."""
    async with lifecycle_lease(get_async_firestore_client()):
        result = await get_account_lifecycle_service().run_lifecycle_pass()
    emit_audit_event(
        AuditAction.GDPR_LIFECYCLE_RUN,
        AuditResourceType.SYSTEM,
        "lifecycle",
        user_id=admin.uid,
        metadata={
            "warned": result.warned,
            "disabled": result.disabled,
            "anonymized": result.anonymized,
            "errors": len(result.errors),
        },
    )
    return GdprRunResult(
        status="ok" if not result.errors else "partial_errors",
        warned=result.warned,
        disabled=result.disabled,
        anonymized=result.anonymized,
        errors=sanitize_errors(result.errors),
    )
