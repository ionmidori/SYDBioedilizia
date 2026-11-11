"""
Admin company info API — /api/admin/company-info (Phase 141).

The company info is what the site shows and what the AI answers with about
SYD, so a save is guarded like the price book: `If-Match` (the version the
editor read; 428 without it, 409 if someone saved first) and a strict schema
(builtin sections, consistent FAQ, served area). Every saved version is kept
in `app_config/company_info/history`.

Logs carry the version and the changed parts, never the texts or the contacts.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Header, Request, Response
from src.auth.admin import require_admin
from src.core.rate_limit import limiter
from src.db.firebase_client import get_async_firestore_client
from src.schemas.company_info_api import (
    CompanyInfoHistory,
    CompanyInfoHistoryItem,
    CompanyInfoResponse,
    CompanyInfoSaveResponse,
    PutCompanyInfoBody,
)
from src.schemas.internal import UserSession
from src.services import company_info
from src.services.admin_quotes import etag_for, parse_if_match
from src.services.audit import AuditAction, AuditResourceType, emit_audit_event
from src.services.company_info_service import CompanyInfoService
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["Admin — Company info"])

_HISTORY_LIMIT = 30


@router.get("/company-info", response_model=CompanyInfoResponse)
@limiter.limit("60/minute")
async def get_company_info(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    response: Response,
    admin: UserSession = Depends(require_admin),  # pyright: ignore[reportUnusedParameter]
) -> CompanyInfoResponse:
    """The whole company info, read fresh (not from the cache)."""
    state = await company_info.read_state(get_async_firestore_client())
    etag = etag_for(state.version)
    response.headers["ETag"] = etag
    return CompanyInfoResponse(
        etag=etag,
        version=state.version,
        source=state.source,
        updated_at=state.updated_at,
        updated_by=state.updated_by,
        ignored_document=state.problem,
        info=state.info,
    )


@router.put("/company-info", response_model=CompanyInfoSaveResponse)
@limiter.limit("20/hour")
async def put_company_info(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    response: Response,
    body: PutCompanyInfoBody,
    if_match: str | None = Header(None, alias="If-Match"),
    admin: UserSession = Depends(require_admin),
) -> CompanyInfoSaveResponse:
    """Replace the company info. This instance serves it at once, every other
    instance within the cache TTL (five minutes)."""
    expected = parse_if_match(if_match)
    result = await company_info.save(
        get_async_firestore_client(), body.info, expected, admin.uid, utc_now(), reason=body.reason
    )
    CompanyInfoService.apply(result.info, result.version, result.updated_at)
    emit_audit_event(
        AuditAction.COMPANY_INFO_UPDATE,
        AuditResourceType.CONFIG,
        company_info.DOCUMENT,
        user_id=admin.uid,
        metadata={"version": result.version, "changed_parts": result.changed_parts},
    )
    logger.info("[CompanyInfo] Saved version %s (changed: %s).", result.version, ", ".join(result.changed_parts))
    etag = etag_for(result.version)
    response.headers["ETag"] = etag
    return CompanyInfoSaveResponse(etag=etag, version=result.version, changed_parts=result.changed_parts)


@router.get("/company-info/history", response_model=CompanyInfoHistory)
@limiter.limit("30/minute")
async def get_company_info_history(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    admin: UserSession = Depends(require_admin),  # pyright: ignore[reportUnusedParameter]
) -> CompanyInfoHistory:
    """The latest saved versions: who changed the company info, when, why, what."""
    db = get_async_firestore_client()
    # `select` keeps the info of every version out of the read.
    query = (
        company_info.history_ref(db)
        .select(list(CompanyInfoHistoryItem.model_fields))
        .order_by("created_at", direction="DESCENDING")
        .limit(_HISTORY_LIMIT)
    )
    rows = [CompanyInfoHistoryItem(**(doc.to_dict() or {})) async for doc in query.stream()]
    return CompanyInfoHistory(items=rows)
