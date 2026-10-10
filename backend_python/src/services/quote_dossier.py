"""
Gather what the admin needs next to a quote draft (Phase 128 dossier):
who the client is, what they asked for, and the photos/renders.

Everything here is best-effort and runs OUTSIDE the draft transaction
(Firebase Auth and Cloud Storage are not transactional): a failure leaves a
field empty, it never blocks saving the draft.

Media come from Cloud Storage, not only from `projects/{pid}/files`: photos
uploaded from the dashboard are written straight to Storage and have no file
document. Object names stay opaque; the dossier stores the path and a human
label ("Foto 1", "Render 2"), and short-lived URLs are minted on read.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from src.schemas.quote import ClientSnapshot, MediaKindType, MediaRef
from src.services.client_profile import build_client_snapshot, get_client_profile
from src.tools.project_storage import iter_project_blobs
from src.utils.download import storage_path_from_url

logger = logging.getLogger(__name__)
# Logs carry no project/session/user ids: the project id is the chat session
# id, an access token for guests (CodeQL py/clear-text-logging).

_LABELS: dict[str, str] = {"input_photo": "Foto", "render": "Render", "video": "Video"}


@dataclass(frozen=True)
class BlobInfo:
    name: str
    content_type: str
    created_at: datetime | None


@dataclass(frozen=True)
class DossierInputs:
    client_snapshot: ClientSnapshot | None = None
    request_details: dict[str, Any] = field(default_factory=dict)
    media: list[MediaRef] = field(default_factory=list)


def media_id_for(blob_path: str) -> str:
    """Stable, opaque id for a Storage object (no path or name leaks into URLs)."""
    return hashlib.sha256(blob_path.encode("utf-8")).hexdigest()[:16]


def classify_blob(name: str, content_type: str, session_id: str) -> MediaKindType | None:
    """Which dossier media kind a project object is, or None if it is not media
    (quote PDFs, documents)."""
    if name.startswith(f"renders/{session_id}/"):
        return "render" if content_type.startswith("image/") else None
    uploads = (f"user-uploads/{session_id}/", f"projects/{session_id}/uploads/")
    if name.startswith(uploads):
        if content_type.startswith("image/"):
            return "input_photo"
        if content_type.startswith("video/"):
            return "video"
    return None


def _list_blobs_sync(session_id: str) -> list[BlobInfo]:
    return [
        BlobInfo(name=b.name, content_type=b.content_type or "", created_at=b.time_created)
        for b in iter_project_blobs(session_id)
    ]


async def _render_sources(db: Any, project_id: str) -> dict[str, str]:
    """render blob path → source photo blob path, from the files metadata."""
    sources: dict[str, str] = {}
    async for doc in db.collection("projects").document(project_id).collection("files").stream():
        data = doc.to_dict() or {}
        if data.get("type") != "render":
            continue
        meta = data.get("metadata") or {}
        render_path = meta.get("storage_path") or storage_path_from_url(data.get("url"))
        source_path = storage_path_from_url(meta.get("source_image_id"))
        if render_path and source_path:
            sources[render_path] = source_path
    return sources


def build_media(blobs: list[BlobInfo], session_id: str, render_sources: dict[str, str]) -> list[MediaRef]:
    """Classify, order by creation time and label the project media."""
    classified: list[tuple[BlobInfo, MediaKindType]] = []
    for blob in blobs:
        kind = classify_blob(blob.name, blob.content_type, session_id)
        if kind is not None:
            classified.append((blob, kind))
    classified.sort(key=lambda pair: (pair[0].created_at is None, pair[0].created_at or datetime.min, pair[0].name))
    counters: dict[str, int] = {}
    media: list[MediaRef] = []
    for blob, kind in classified:
        counters[kind] = counters.get(kind, 0) + 1
        source = render_sources.get(blob.name)
        media.append(
            MediaRef(
                media_id=media_id_for(blob.name),
                kind=kind,
                blob_path=blob.name,
                mime=blob.content_type or None,
                label=f"{_LABELS[kind]} {counters[kind]}",
                source_media_id=media_id_for(source) if source else None,
                created_at=blob.created_at,
            )
        )
    return media


async def collect_media(db: Any, project_id: str) -> list[MediaRef]:
    try:
        blobs = await asyncio.to_thread(_list_blobs_sync, project_id)
    except Exception as exc:  # noqa: BLE001 — dossier enrichment is best-effort by contract
        logger.warning("[QuoteDossier] Storage listing failed", extra={"error_type": type(exc).__name__})
        return []
    try:
        sources = await _render_sources(db, project_id)
    except Exception as exc:  # noqa: BLE001 — render→photo links are optional
        logger.warning("[QuoteDossier] Files metadata read failed", extra={"error_type": type(exc).__name__})
        sources = {}
    return build_media(blobs, project_id, sources)


def format_address(address: Any) -> str | None:
    if isinstance(address, str):
        return address.strip() or None
    if not isinstance(address, dict):
        return None
    street = (address.get("street") or "").strip()
    locality = " ".join(p for p in ((address.get("zip") or "").strip(), (address.get("city") or "").strip()) if p)
    return ", ".join(p for p in (street, locality) if p) or None


def request_details_from_session(session: dict[str, Any]) -> dict[str, Any]:
    """QuoteRequest fields from `sessions/{id}.constructionDetails`."""
    details = session.get("constructionDetails") or {}
    if not isinstance(details, dict):
        return {}
    out: dict[str, Any] = {
        "address": format_address(details.get("address")),
        "footage_sqm": details.get("footage_sqm"),
        "budget_cap": details.get("budget_cap"),
        "technical_notes": details.get("technical_notes"),
    }
    return {k: v for k, v in out.items() if v not in (None, "")}


async def collect_request_details(db: Any, session_id: str) -> dict[str, Any]:
    try:
        snap = await db.collection("sessions").document(session_id).get()
    except Exception as exc:  # noqa: BLE001 — dossier enrichment is best-effort by contract
        logger.warning("[QuoteDossier] Session read failed", extra={"error_type": type(exc).__name__})
        return {}
    return request_details_from_session((snap.to_dict() or {}) if snap.exists else {})


async def gather_dossier_inputs(db: Any, project_id: str, user_id: str, now: datetime) -> DossierInputs:
    """Client snapshot + site details + media for the quote of `project_id`."""
    profile, details, media = await asyncio.gather(
        get_client_profile(user_id),
        collect_request_details(db, project_id),
        collect_media(db, project_id),
    )
    return DossierInputs(
        client_snapshot=build_client_snapshot(user_id, profile, now),
        request_details=details,
        media=media,
    )
