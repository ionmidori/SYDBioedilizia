"""
Admin content management — portfolio projects and testimonial moderation
(Phase 128, Fase 6.1b). The public landing page reads both through
`/api/content/*`, so what is saved here is what visitors see.

Logs carry counts and statuses, never names, texts or URLs of the content.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any

from firebase_admin import storage
from google.api_core.exceptions import GoogleAPIError
from google.cloud.firestore_v1 import Query
from google.cloud.firestore_v1.base_query import FieldFilter

from src.core.config import settings
from src.core.exceptions import AppException, ResourceNotFound
from src.schemas.admin_content import (
    AdminTestimonial,
    PortfolioProject,
    PortfolioStats,
    TestimonialStats,
    TestimonialStatus,
    portfolio_blob_path,
)
from src.services.admin_kpis import testimonial_stats

logger = logging.getLogger(__name__)

PORTFOLIO = "portfolio_projects"
TESTIMONIALS = "testimonials"


class InvalidPortfolioImageError(AppException):
    status_code = 422
    error_code = "INVALID_PORTFOLIO_IMAGE"

    def __init__(self) -> None:
        super().__init__(
            message="The image must be one uploaded to the portfolio folder of this project's storage."
        )


def _bucket_name() -> str:
    return settings.FIREBASE_STORAGE_BUCKET or ""


def checked_image_url(url: str) -> str:
    """The URL if it points at OUR portfolio folder, else 422. It is rendered on the public site."""
    if not portfolio_blob_path(url, _bucket_name()):
        raise InvalidPortfolioImageError()
    return url


# ── Portfolio ─────────────────────────────────────────────────────────────────


def project_from(doc_id: str, data: dict[str, Any]) -> PortfolioProject:
    raw_stats = data.get("stats")
    stats: dict[str, Any] = raw_stats if isinstance(raw_stats, dict) else {}
    return PortfolioProject(
        id=doc_id,
        title=str(data.get("title") or ""),
        category=str(data.get("category") or "Altro"),
        location=str(data.get("location") or ""),
        description=str(data.get("description") or ""),
        stats=PortfolioStats(**{k: str(stats.get(k) or "")[:40] for k in ("area", "duration", "budget")}),
        image_url=data.get("image_url") or None,
        active=bool(data.get("active", True)),
        order=int(data.get("order") or 0),
        created_at=data.get("created_at"),
        updated_at=data.get("updated_at"),
    )


async def list_projects(db: Any) -> list[PortfolioProject]:
    query = db.collection(PORTFOLIO).order_by("order")
    return [project_from(doc.id, doc.to_dict() or {}) async for doc in query.stream()]


async def next_order(db: Any) -> int:
    query = db.collection(PORTFOLIO).order_by("order", direction=Query.DESCENDING).limit(1)
    async for doc in query.stream():
        return int((doc.to_dict() or {}).get("order") or 0) + 1
    return 1


async def create_project(db: Any, data: dict[str, Any], now: datetime) -> PortfolioProject:
    payload = {**data, "order": await next_order(db), "created_at": now, "updated_at": now}
    _, ref = await db.collection(PORTFOLIO).add(payload)
    return project_from(ref.id, payload)


async def _image_in_use(db: Any, image_url: str | None, except_id: str) -> bool:
    """Does another project still show this image? Compared by the canonical
    Storage path, not by the URL text (%2F vs %2f, with or without ?alt=media)."""
    path = portfolio_blob_path(image_url, _bucket_name()) if image_url else None
    if not path:
        return False
    async for doc in db.collection(PORTFOLIO).stream():
        if doc.id == except_id:
            continue
        other = (doc.to_dict() or {}).get("image_url")
        if isinstance(other, str) and portfolio_blob_path(other, _bucket_name()) == path:
            return True
    return False


async def update_project(
    db: Any, project_id: str, changes: dict[str, Any], now: datetime
) -> tuple[PortfolioProject, str | None]:
    """Apply a partial update. Returns the project and the previous image URL
    if it was replaced AND no other project still uses it (safe to delete)."""
    ref = db.collection(PORTFOLIO).document(project_id)
    snap = await ref.get()
    if not snap.exists:
        raise ResourceNotFound(message="Portfolio project not found.")
    before = snap.to_dict() or {}
    await ref.update({**changes, "updated_at": now})
    after = {**before, **changes, "updated_at": now}
    old_image = before.get("image_url") if isinstance(before.get("image_url"), str) else None
    replaced = (
        old_image
        if "image_url" in changes
        and old_image
        and portfolio_blob_path(changes["image_url"], _bucket_name()) != portfolio_blob_path(old_image, _bucket_name())
        and not await _image_in_use(db, old_image, project_id)
        else None
    )
    return project_from(project_id, after), replaced


async def delete_project(db: Any, project_id: str) -> str | None:
    """Delete the project; returns its image URL only if no other project uses it."""
    ref = db.collection(PORTFOLIO).document(project_id)
    snap = await ref.get()
    if not snap.exists:
        raise ResourceNotFound(message="Portfolio project not found.")
    image_url = (snap.to_dict() or {}).get("image_url")
    await ref.delete()
    if isinstance(image_url, str) and not await _image_in_use(db, image_url, project_id):
        return image_url
    return None


def _delete_blob_sync(blob_path: str) -> None:
    storage.bucket().blob(blob_path).delete()


async def delete_image_quietly(image_url: str | None) -> None:
    """Remove an image we own from Storage. A missing file or a Storage hiccup
    must not fail the content change (the file is merely orphaned): logged."""
    path = portfolio_blob_path(image_url, _bucket_name()) if image_url else None
    if not path:
        return
    try:
        await asyncio.to_thread(_delete_blob_sync, path)
    except (GoogleAPIError, OSError, RuntimeError):
        logger.warning("[Portfolio] Could not delete an image from Storage.", exc_info=True)


# ── Testimonials ──────────────────────────────────────────────────────────────


def testimonial_from(doc_id: str, data: dict[str, Any]) -> AdminTestimonial:
    raw_status = data.get("status")
    status: TestimonialStatus = raw_status if raw_status in ("pending", "approved", "rejected") else "pending"
    rating = data.get("rating")
    return AdminTestimonial(
        id=doc_id,
        name=str(data.get("name") or "—"),
        location=str(data.get("location") or ""),
        text=str(data.get("text") or ""),
        rating=rating if isinstance(rating, int) and 1 <= rating <= 5 else 5,
        status=status,
        admin_notes=data.get("admin_notes") or None,
        created_at=data.get("createdAt"),
        reviewed_at=data.get("reviewed_at"),
    )


async def list_testimonials(db: Any, status: str, limit: int = 200) -> list[AdminTestimonial]:
    # Ordered in the query (index: status + createdAt desc): the cap keeps the NEWEST.
    query = (
        db.collection(TESTIMONIALS)
        .where(filter=FieldFilter("status", "==", status))
        .order_by("createdAt", direction=Query.DESCENDING)
        .limit(limit)
    )
    return [testimonial_from(doc.id, doc.to_dict() or {}) async for doc in query.stream()]


async def moderate(
    db: Any, testimonial_id: str, decision: str, notes: str | None, admin_uid: str, now: datetime
) -> tuple[str, TestimonialStats]:
    ref = db.collection(TESTIMONIALS).document(testimonial_id)
    snap = await ref.get()
    if not snap.exists:
        raise ResourceNotFound(message="Testimonial not found.")
    status = "approved" if decision == "approve" else "rejected"
    update: dict[str, Any] = {"status": status, "reviewed_by": admin_uid, "reviewed_at": now}
    if notes:
        update["admin_notes"] = notes
    await ref.update(update)
    return status, await testimonial_stats(db)
