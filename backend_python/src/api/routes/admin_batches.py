"""
Admin batches API — /api/admin/batches (Phase 128, Fase 6.1b), read-only.

A client can send several quotes at once (a "batch"). Here the admin sees the
batch with the LIVE state of each quote and opens the dossier of each one:
decisions (approve → send, reject) are taken there, where photos, lines and the
email are visible. The batch status follows automatically (`batch_sync`).

(The old "approve this project in the batch" button approved and emailed the
quote straight away, without showing the dossier: it is not offered here.)
"""
from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, Path, Query, Request
from google.cloud.firestore_v1.base_query import FieldFilter
from src.auth.admin import require_admin
from src.core.exceptions import ResourceNotFound
from src.core.money import to_cents
from src.core.rate_limit import limiter
from src.db.firebase_client import get_async_firestore_client
from src.schemas.admin_content import (
    AdminBatchDetail,
    AdminBatchList,
    AdminBatchListItem,
    AdminBatchProject,
)
from src.schemas.internal import UserSession
from src.services.client_profile import ClientProfile, get_client_profile
from src.services.quote_drafts import quote_doc_ref

router = APIRouter(prefix="/api/admin", tags=["Admin — Batches"])

_ID = Path(..., min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_\-]+$")
_OPEN = ["submitted", "partially_approved"]
_CLOSED = ["approved", "rejected"]
_LIST_CAP = 100


def _statuses(scope: str) -> list[str]:
    return {"open": _OPEN, "closed": _CLOSED}.get(scope, [*_OPEN, *_CLOSED])


async def _profiles(user_ids: set[str]) -> dict[str, ClientProfile]:
    ids = sorted(user_ids)
    return dict(zip(ids, await asyncio.gather(*(get_client_profile(uid) for uid in ids)), strict=True))


def _decided(projects: list[dict[str, Any]]) -> int:
    return sum(1 for p in projects if p.get("status") in ("approved", "rejected"))


@router.get("/batches", response_model=AdminBatchList)
@limiter.limit("60/minute")
async def list_batches(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    scope: str = Query("open", pattern="^(open|closed|all)$"),
    admin: UserSession = Depends(require_admin),  # pyright: ignore[reportUnusedParameter]
) -> AdminBatchList:
    db = get_async_firestore_client()
    query = db.collection("quote_batches").where(filter=FieldFilter("status", "in", _statuses(scope)))
    # Newest first INSIDE the query (index: status + submitted_at desc): the cap keeps the newest.
    query = query.order_by("submitted_at", direction="DESCENDING").limit(_LIST_CAP)
    docs = [(doc.id, doc.to_dict() or {}) async for doc in query.stream()]
    profiles = await _profiles({str(d.get("user_id")) for _, d in docs if d.get("user_id")})
    items = []
    for batch_id, data in docs:
        profile = profiles.get(str(data.get("user_id")), ClientProfile())
        projects = list(data.get("projects") or [])
        items.append(
            AdminBatchListItem(
                batch_id=batch_id,
                status=data.get("status", "submitted"),
                client_display_name=profile.name or None,
                client_email=profile.email or None,
                total_projects=int(data.get("total_projects") or len(projects)),
                decided_projects=_decided(projects),
                batch_grand_total=to_cents(data.get("batch_grand_total") or 0),
                potential_savings=to_cents(data.get("potential_savings") or 0),
                submitted_at=data.get("submitted_at"),
            )
        )
    return AdminBatchList(items=items)


@router.get("/batches/{batch_id}", response_model=AdminBatchDetail)
@limiter.limit("60/minute")
async def get_batch(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    batch_id: str = _ID,
    admin: UserSession = Depends(require_admin),  # pyright: ignore[reportUnusedParameter]
) -> AdminBatchDetail:
    db = get_async_firestore_client()
    snap = await db.collection("quote_batches").document(batch_id).get()
    if not snap.exists:
        raise ResourceNotFound(message="Batch not found.")
    data = snap.to_dict() or {}
    projects: list[dict[str, Any]] = list(data.get("projects") or [])

    quotes, profile = await asyncio.gather(
        asyncio.gather(*(quote_doc_ref(db, str(p.get("project_id"))).get() for p in projects)),
        get_client_profile(str(data.get("user_id") or "")),
    )
    rows = []
    for project, quote_snap in zip(projects, quotes, strict=True):
        quote = (quote_snap.to_dict() or {}) if quote_snap.exists else {}
        rows.append(
            AdminBatchProject(
                project_id=str(project.get("project_id")),
                project_name=str(project.get("project_name") or project.get("project_id")),
                batch_status=project.get("status", "draft"),
                quote_status=quote.get("status"),
                delivery_status=quote.get("delivery_status", "none"),
                quote_number=quote.get("quote_number"),
                item_count=len(quote.get("items") or []) or int(project.get("item_count") or 0),
                grand_total=to_cents((quote.get("financials") or {}).get("grand_total") or 0),
                admin_notes=project.get("admin_notes"),
            )
        )
    return AdminBatchDetail(
        batch_id=batch_id,
        status=data.get("status", "submitted"),
        client_display_name=profile.name or None,
        client_email=profile.email or None,
        batch_subtotal=to_cents(data.get("batch_subtotal") or 0),
        batch_grand_total=to_cents(data.get("batch_grand_total") or 0),
        potential_savings=to_cents(data.get("potential_savings") or 0),
        submitted_at=data.get("submitted_at"),
        aggregation_preview=list(data.get("aggregation_preview") or []),
        projects=rows,
    )
