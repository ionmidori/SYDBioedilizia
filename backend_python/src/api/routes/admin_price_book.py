"""
Admin price book API — /api/admin/price-book (Phase 128, Fase 6.1a).

The price book is what the AI quotes with, so a save is guarded twice:
`If-Match` (the version the editor read; 428 without it, 409 if someone saved
first) and a strict schema (unique SKUs, sane numbers). Every saved version is
kept in `app_config/price_book/history`.

Logs carry counts and the version, never prices or descriptions.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Header, Request, Response
from src.auth.admin import require_admin
from src.core.rate_limit import limiter
from src.db.firebase_client import get_async_firestore_client
from src.schemas.internal import UserSession
from src.schemas.price_book import (
    PriceBookHistory,
    PriceBookHistoryItem,
    PriceBookItem,
    PriceBookResponse,
    PriceBookSaveResponse,
    PutPriceBookBody,
)
from src.services import price_book
from src.services.admin_quotes import etag_for, parse_if_match
from src.services.audit import AuditAction, AuditResourceType, emit_audit_event
from src.services.pricing_service import PricingService
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["Admin — Price book"])

_HISTORY_LIMIT = 30


@router.get("/price-book", response_model=PriceBookResponse)
@limiter.limit("60/minute")
async def get_price_book(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    response: Response,
    admin: UserSession = Depends(require_admin),  # pyright: ignore[reportUnusedParameter]
) -> PriceBookResponse:
    """The whole price book, read fresh (not from the pricing cache)."""
    state = await price_book.read_state(get_async_firestore_client())
    etag = etag_for(state.version)
    response.headers["ETag"] = etag
    return PriceBookResponse(
        etag=etag,
        version=state.version,
        source=state.source,
        item_count=len(state.items),
        updated_at=state.updated_at,
        updated_by=state.updated_by,
        ignored_document=state.problem,
        items=[PriceBookItem(**item) for item in state.items],
    )


@router.put("/price-book", response_model=PriceBookSaveResponse)
@limiter.limit("20/hour")
async def put_price_book(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    response: Response,
    body: PutPriceBookBody,
    if_match: str | None = Header(None, alias="If-Match"),
    admin: UserSession = Depends(require_admin),
) -> PriceBookSaveResponse:
    """Replace the price book. The AI uses the new prices from its next turn
    on this instance, and within one minute on every other instance."""
    expected = parse_if_match(if_match)
    result = await price_book.save(
        get_async_firestore_client(), body.items, expected, admin.uid, utc_now(), reason=body.reason
    )
    PricingService.apply_price_book(result.items, result.version, result.updated_at)
    emit_audit_event(
        AuditAction.PRICE_BOOK_UPDATE,
        AuditResourceType.CONFIG,
        price_book.DOCUMENT,
        user_id=admin.uid,
        metadata={
            "version": result.version,
            "item_count": result.item_count,
            "added": result.added,
            "removed": result.removed,
            "changed": result.changed,
        },
    )
    logger.info(
        "[PriceBook] Saved version %s (%s items: +%s -%s ~%s).",
        result.version, result.item_count, result.added, result.removed, result.changed,
    )
    etag = etag_for(result.version)
    response.headers["ETag"] = etag
    return PriceBookSaveResponse(
        etag=etag,
        version=result.version,
        item_count=result.item_count,
        added=result.added,
        removed=result.removed,
        changed=result.changed,
    )


@router.get("/price-book/history", response_model=PriceBookHistory)
@limiter.limit("30/minute")
async def get_price_book_history(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    admin: UserSession = Depends(require_admin),  # pyright: ignore[reportUnusedParameter]
) -> PriceBookHistory:
    """The latest saved versions: who changed the prices, when, why, how much."""
    db = get_async_firestore_client()
    # `select` keeps the (large) item arrays of every version out of the read.
    query = (
        price_book.history_ref(db)
        .select(list(PriceBookHistoryItem.model_fields))
        .order_by("created_at", direction="DESCENDING")
        .limit(_HISTORY_LIMIT)
    )
    rows = [PriceBookHistoryItem(**(doc.to_dict() or {})) async for doc in query.stream()]
    return PriceBookHistory(items=rows)
