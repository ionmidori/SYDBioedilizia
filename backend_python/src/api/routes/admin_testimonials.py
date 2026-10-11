"""
Admin testimonial moderation — /api/admin/testimonials (Phase 128, Fase 6.1b).

A visitor's review is `pending` until an admin approves it; only `approved`
reviews appear on the landing page (`/api/content/testimonials`). Unlike the
old tool, an approved review can also be taken down later (reject).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Path, Query, Request
from src.auth.admin import require_admin
from src.core.rate_limit import limiter
from src.db.firebase_client import get_async_firestore_client
from src.schemas.admin_content import (
    ModerateBody,
    ModerateResponse,
    TestimonialList,
    TestimonialStatus,
)
from src.schemas.internal import UserSession
from src.services import admin_content as svc
from src.services.admin_kpis import testimonial_stats
from src.services.audit import AuditAction, AuditResourceType, emit_audit_event
from src.utils.datetime_utils import utc_now

router = APIRouter(prefix="/api/admin", tags=["Admin — Testimonials"])

_ID = Path(..., min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_\-]+$")


@router.get("/testimonials", response_model=TestimonialList)
@limiter.limit("60/minute")
async def list_testimonials(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    status: TestimonialStatus = Query("pending"),
    admin: UserSession = Depends(require_admin),  # pyright: ignore[reportUnusedParameter]
) -> TestimonialList:
    db = get_async_firestore_client()
    items = await svc.list_testimonials(db, status)
    return TestimonialList(items=items, stats=await testimonial_stats(db))


@router.post("/testimonials/{testimonial_id}/moderate", response_model=ModerateResponse)
@limiter.limit("120/hour")
async def moderate_testimonial(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    body: ModerateBody,
    testimonial_id: str = _ID,
    admin: UserSession = Depends(require_admin),
) -> ModerateResponse:
    status, stats = await svc.moderate(
        get_async_firestore_client(), testimonial_id, body.decision, body.notes, admin.uid, utc_now()
    )
    emit_audit_event(
        AuditAction.TESTIMONIAL_MODERATE,
        AuditResourceType.CONTENT,
        testimonial_id,
        user_id=admin.uid,
        metadata={"decision": body.decision},
    )
    return ModerateResponse(id=testimonial_id, status=status, stats=stats)  # type: ignore[arg-type]  # Literal from our own mapping
