"""
Admin review of quotes (Phase 128 — PR 3.1): the domain behind /api/admin/quotes.

Every write runs in a Firestore transaction whose body is a plain function
(`*_tx`) taking the transaction, so it is unit-testable with in-memory fakes.
The rules every write enforces, in this order:

1. the quote exists and is not soft-deleted;
2. optimistic concurrency — content writes (edit, approve) carry the version
   the admin saw (`If-Match: "v{n}"`); a newer version answers 409;
3. the review lock — another admin holding a fresh lock (30 min lease) blocks
   the write with 409 QUOTE_LOCKED;
4. the state machine (`quote_state.transition`) — an illegal action is a 409.

Content changes write an immutable revision with a line-item diff. PDF
generation and audit events happen after the commit (outside the transaction).
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from firebase_admin import storage
from google.cloud.firestore_v1 import DELETE_FIELD, FieldFilter, Query

from src.core.exceptions import (
    MediaNotFoundError,
    PreconditionRequiredError,
    QuoteLockedError,
    QuoteNotFoundError,
    QuoteVersionConflictError,
)
from src.schemas.quote import QuoteItem, RevisionChange
from src.services.pricing_service import PricingService
from src.services.quote_drafts import build_revision, quote_doc_ref, revision_ref
from src.services.quote_state import QuoteEvent, QuoteStatus, transition
from src.utils.download import session_storage_prefixes

logger = logging.getLogger(__name__)

LOCK_LEASE = timedelta(minutes=30)
MEDIA_URL_TTL = timedelta(minutes=15)
_ETAG_RE = re.compile(r'^(?:W/)?"?v(\d+)"?$')

# ── Concurrency helpers ───────────────────────────────────────────────────────


def etag_for(version: int) -> str:
    return f'"v{version}"'


def parse_if_match(header: str | None) -> int:
    """Version from an If-Match header (`"v3"`, `v3`, `W/"v3"`); 428 if absent."""
    if not header:
        raise PreconditionRequiredError()
    match = _ETAG_RE.match(header.strip())
    if match is None:
        raise PreconditionRequiredError()
    return int(match.group(1))


def _version(quote: dict[str, Any]) -> int:
    return int(quote.get("version") or 1)


def _check_version(project_id: str, quote: dict[str, Any], expected: int) -> None:
    current = _version(quote)
    if current != expected:
        raise QuoteVersionConflictError(project_id, expected, current)


def _aware(value: Any) -> datetime | None:
    return value if isinstance(value, datetime) else None


def _check_lock(project_id: str, quote: dict[str, Any], admin_uid: str, now: datetime) -> None:
    review = quote.get("review") or {}
    holder = review.get("locked_by")
    locked_at = _aware(review.get("locked_at"))
    if holder and holder != admin_uid and locked_at is not None and now - locked_at < LOCK_LEASE:
        raise QuoteLockedError(project_id, holder)


async def _read(transaction: Any, db: Any, project_id: str) -> tuple[Any, dict[str, Any]]:
    ref = quote_doc_ref(db, project_id)
    snap = await ref.get(transaction=transaction)
    data = (snap.to_dict() or {}) if snap.exists else {}
    if not snap.exists or data.get("status") == QuoteStatus.DELETED:
        raise QuoteNotFoundError(project_id)
    return ref, data


def _lock_fields(admin_uid: str, now: datetime) -> dict[str, Any]:
    return {"review.locked_by": admin_uid, "review.locked_at": now}


_UNLOCK = {"review.locked_by": DELETE_FIELD, "review.locked_at": DELETE_FIELD}


@dataclass(frozen=True)
class WriteResult:
    project_id: str
    status: str
    version: int
    quote_number: str | None


def _result(project_id: str, quote: dict[str, Any], status: str, version: int) -> WriteResult:
    return WriteResult(project_id, status, version, quote.get("quote_number"))


# ── Line items ────────────────────────────────────────────────────────────────

_ITEM_FIELDS = ("description", "unit", "qty", "unit_price")


def _item_key(item: dict[str, Any]) -> tuple[Any, ...]:
    return (item.get("sku"), *(item.get(f) for f in _ITEM_FIELDS))


def normalise_items(new_items: list[QuoteItem], previous: list[dict[str, Any]]) -> list[QuoteItem]:
    """Server-side totals (never trust the client) and `manual_override` for
    every line that is not identical to a line of the previous version."""
    previous_by_key = {_item_key(p): p for p in previous}
    out: list[QuoteItem] = []
    for item in new_items:
        data = item.model_dump()
        data["total"] = round(item.qty * item.unit_price, 2)
        same = previous_by_key.get(_item_key(data))
        data["manual_override"] = bool(same.get("manual_override")) if same is not None else True
        out.append(QuoteItem(**data))
    return out


def _summary(item: dict[str, Any]) -> dict[str, Any]:
    return {k: item.get(k) for k in ("description", "unit", "qty", "unit_price", "total")}


def diff_items(before: list[dict[str, Any]], after: list[dict[str, Any]]) -> list[RevisionChange]:
    """Line-item diff, matched by SKU (positionally among lines with the same SKU)."""
    changes: list[RevisionChange] = []
    remaining: dict[str, list[dict[str, Any]]] = {}
    for item in before:
        remaining.setdefault(str(item.get("sku")), []).append(item)
    for item in after:
        sku = str(item.get("sku"))
        pool = remaining.get(sku) or []
        if not pool:
            changes.append(RevisionChange(change="added", sku=sku, after=_summary(item)))
            continue
        old = pool.pop(0)
        if _summary(old) != _summary(item):
            changes.append(RevisionChange(change="changed", sku=sku, before=_summary(old), after=_summary(item)))
    for sku, pool in remaining.items():
        changes.extend(RevisionChange(change="removed", sku=sku, before=_summary(old)) for old in pool)
    return changes


# ── Transaction bodies ────────────────────────────────────────────────────────


async def claim_tx(transaction: Any, db: Any, project_id: str, admin_uid: str, now: datetime) -> WriteResult:
    """Take the review lock (and move the quote to in_review)."""
    ref, quote = await _read(transaction, db, project_id)
    _check_lock(project_id, quote, admin_uid, now)
    status = transition(quote.get("status", ""), QuoteEvent.OPEN)
    transaction.update(ref, {"status": status.value, **_lock_fields(admin_uid, now)})
    return _result(project_id, quote, status.value, _version(quote))


async def release_tx(transaction: Any, db: Any, project_id: str, admin_uid: str, now: datetime) -> WriteResult:
    """Give the lock back; the quote returns to the review queue."""
    ref, quote = await _read(transaction, db, project_id)
    _check_lock(project_id, quote, admin_uid, now)
    status = transition(quote.get("status", ""), QuoteEvent.RELEASE)
    transaction.update(ref, {"status": status.value, **_UNLOCK})
    return _result(project_id, quote, status.value, _version(quote))


async def edit_tx(
    transaction: Any,
    db: Any,
    project_id: str,
    admin_uid: str,
    expected_version: int,
    now: datetime,
    items: list[QuoteItem] | None = None,
    admin_notes: str | None = None,
    vat_rate: float | None = None,
    reason: str | None = None,
) -> WriteResult:
    """Change items / notes / VAT: new version + immutable revision with diff."""
    ref, quote = await _read(transaction, db, project_id)
    _check_version(project_id, quote, expected_version)
    _check_lock(project_id, quote, admin_uid, now)
    status = transition(quote.get("status", ""), QuoteEvent.EDIT)

    previous_items: list[dict[str, Any]] = list(quote.get("items") or [])
    new_items = (
        normalise_items(items, previous_items)
        if items is not None
        else [QuoteItem(**i) for i in previous_items]
    )
    rate = vat_rate if vat_rate is not None else float((quote.get("financials") or {}).get("vat_rate", 0.22))
    financials = PricingService.calculate_financials(new_items, vat_rate=rate)
    notes = admin_notes if admin_notes is not None else quote.get("admin_notes")
    version = expected_version + 1
    items_dump = [i.model_dump() for i in new_items]

    transaction.update(
        ref,
        {
            "items": items_dump,
            "financials": financials.model_dump(),
            "admin_notes": notes,
            "version": version,
            "status": status.value,
            "updated_at": now,
            **_lock_fields(admin_uid, now),
        },
    )
    revision = build_revision(version, new_items, financials, notes, "admin", admin_uid, now, reason=reason)
    revision["diff"] = [c.model_dump(exclude_none=True) for c in diff_items(previous_items, items_dump)]
    transaction.set(revision_ref(ref, version), revision)
    return _result(project_id, quote, status.value, version)


async def approve_tx(
    transaction: Any, db: Any, project_id: str, admin_uid: str, expected_version: int, now: datetime
) -> tuple[WriteResult, dict[str, Any]]:
    """Freeze the current version as approved. Returns the approved document
    (for the PDF, generated after the commit)."""
    ref, quote = await _read(transaction, db, project_id)
    _check_version(project_id, quote, expected_version)
    _check_lock(project_id, quote, admin_uid, now)
    status = transition(quote.get("status", ""), QuoteEvent.APPROVE)
    updates = {
        "status": status.value,
        "updated_at": now,
        "admin_decision": "approve",
        "reviewed_by": admin_uid,
        "review.approved_by": admin_uid,
        "review.approved_at": now,
        "review.approved_revision": expected_version,
        **_UNLOCK,
    }
    transaction.update(ref, updates)
    approved = {**quote, "status": status.value}
    return _result(project_id, quote, status.value, expected_version), approved


async def reject_tx(
    transaction: Any, db: Any, project_id: str, admin_uid: str, reason: str, now: datetime
) -> WriteResult:
    ref, quote = await _read(transaction, db, project_id)
    _check_lock(project_id, quote, admin_uid, now)
    status = transition(quote.get("status", ""), QuoteEvent.REJECT)
    transaction.update(
        ref,
        {
            "status": status.value,
            "updated_at": now,
            "admin_decision": "reject",
            "reviewed_by": admin_uid,
            "review.reason": reason,
            **_UNLOCK,
        },
    )
    return _result(project_id, quote, status.value, _version(quote))


async def reopen_tx(
    transaction: Any, db: Any, project_id: str, admin_uid: str, reason: str, now: datetime
) -> WriteResult:
    """Approved (never sent) or rejected → back in review, locked to this admin."""
    ref, quote = await _read(transaction, db, project_id)
    _check_lock(project_id, quote, admin_uid, now)
    status = transition(quote.get("status", ""), QuoteEvent.REOPEN)
    transaction.update(
        ref,
        {
            "status": status.value,
            "updated_at": now,
            "admin_decision": DELETE_FIELD,
            "review.reason": reason,
            "review.approved_by": DELETE_FIELD,
            "review.approved_at": DELETE_FIELD,
            "review.approved_revision": DELETE_FIELD,
            **_lock_fields(admin_uid, now),
        },
    )
    return _result(project_id, quote, status.value, _version(quote))


# ── PDF (after approval) ──────────────────────────────────────────────────────


def pdf_blob_path(project_id: str, quote_number: str | None, version: int) -> str:
    """`projects/{pid}/quotes/PRV-2026-0042_r3.pdf` — no personal data in the name."""
    stem = quote_number or "preventivo"
    return f"projects/{project_id}/quotes/{stem}_r{version}.pdf"


def pdf_input(quote: dict[str, Any], project_id: str) -> dict[str, Any]:
    """The approved document as PdfService expects it (client name from the
    snapshot, never the uid — PdfService falls back to user_id otherwise)."""
    data = {**quote, "project_id": project_id}
    snapshot = quote.get("client_snapshot") or {}
    data["client_name"] = snapshot.get("display_name") or "Cliente"
    return data


def upload_pdf_sync(pdf_bytes: bytes, blob_path: str) -> None:
    blob = storage.bucket().blob(blob_path)
    blob.upload_from_string(pdf_bytes, content_type="application/pdf")


# ── Reads ─────────────────────────────────────────────────────────────────────

OPEN_STATUSES = ("draft", "pending_review", "in_review")


def encode_cursor(path: str) -> str:
    return base64.urlsafe_b64encode(json.dumps({"p": path}).encode()).decode()


def decode_cursor(cursor: str) -> str | None:
    try:
        data = json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())
    except (ValueError, UnicodeDecodeError):
        return None
    path = data.get("p") if isinstance(data, dict) else None
    # Only quote documents may anchor the page.
    if isinstance(path, str) and path.startswith("projects/") and path.endswith("/private_data/quote"):
        return path
    return None


def list_row(project_id: str, quote: dict[str, Any]) -> dict[str, Any]:
    """One inbox row: who, what, how much — no prices hidden from the admin."""
    snapshot = quote.get("client_snapshot") or {}
    request = quote.get("request") or {}
    media = quote.get("media") or []
    thumb = next((m for m in media if m.get("kind") == "input_photo"), None) or next(
        (m for m in media if m.get("kind") == "render"), None
    )
    summary = request.get("summary") or ""
    return {
        "project_id": project_id,
        "quote_number": quote.get("quote_number"),
        "client_display_name": snapshot.get("display_name"),
        "client_email": snapshot.get("email"),
        "client_is_guest": bool(snapshot.get("is_guest")),
        "status": quote.get("status", "draft"),
        "delivery_status": quote.get("delivery_status", "none"),
        "grand_total": float((quote.get("financials") or {}).get("grand_total", 0.0)),
        "item_count": len(quote.get("items") or []),
        "channel": request.get("channel"),
        "summary": summary[:160] + ("…" if len(summary) > 160 else ""),
        "thumbnail_media_id": thumb.get("media_id") if thumb else None,
        "locked_by": (quote.get("review") or {}).get("locked_by"),
        "created_at": quote.get("created_at"),
        "updated_at": quote.get("updated_at"),
    }


def build_list_query(db: Any, statuses: list[str] | None, search: str | None, limit: int) -> Any:
    query = db.collection_group("private_data").where(filter=FieldFilter("doc_type", "==", "quote"))
    if statuses:
        query = query.where(filter=FieldFilter("status", "in", statuses[:10]))
    if search:
        query = query.where(filter=FieldFilter("search_keys", "array_contains", search.strip().lower()))
    return query.order_by("updated_at", direction=Query.DESCENDING).limit(limit + 1)


async def list_quotes(
    db: Any, statuses: list[str] | None, search: str | None, limit: int, cursor: str | None
) -> tuple[list[dict[str, Any]], str | None]:
    query = build_list_query(db, statuses, search, limit)
    anchor_path = decode_cursor(cursor) if cursor else None
    if anchor_path:
        anchor = await db.document(anchor_path).get()
        if anchor.exists:
            query = query.start_after(anchor)
    docs = [doc async for doc in query.stream()]
    rows = [list_row(doc.reference.parent.parent.id, doc.to_dict() or {}) for doc in docs[:limit]]
    next_cursor = encode_cursor(docs[limit - 1].reference.path) if len(docs) > limit else None
    return rows, next_cursor


def sign_url_sync(blob_path: str, disposition: str | None) -> str:
    blob = storage.bucket().blob(blob_path)
    kwargs: dict[str, Any] = {"version": "v4", "expiration": MEDIA_URL_TTL, "method": "GET"}
    if disposition:
        kwargs["response_disposition"] = disposition
    return blob.generate_signed_url(**kwargs)


def _owned_path(project_id: str, blob_path: str) -> bool:
    return blob_path.startswith(session_storage_prefixes(project_id))


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "file"


def download_filename(quote_number: str | None, label: str, blob_path: str) -> str:
    """`PRV-2026-0042_foto-1.jpg` — readable, ASCII-only, no personal data."""
    ext = blob_path.rsplit(".", 1)[-1].lower() if "." in blob_path.rsplit("/", 1)[-1] else "bin"
    ext = re.sub(r"[^a-z0-9]", "", ext)[:5] or "bin"
    return f"{quote_number or 'preventivo'}_{_slug(label)}.{ext}"


async def media_url(
    quote: dict[str, Any], project_id: str, media_id: str, attachment: bool
) -> tuple[str, str]:
    """(url, filename) for one media of the quote. Links are returned as-is and
    never fetched server-side (SSRF); Storage paths must belong to the project."""
    media = next((m for m in quote.get("media") or [] if m.get("media_id") == media_id), None)
    if media is None:
        raise MediaNotFoundError(media_id)
    if media.get("kind") == "link":
        return str(media.get("external_url") or ""), ""
    blob_path = media.get("blob_path") or ""
    if not blob_path or not _owned_path(project_id, blob_path):
        raise MediaNotFoundError(media_id)
    filename = download_filename(quote.get("quote_number"), str(media.get("label") or "file"), blob_path)
    disposition = f'{"attachment" if attachment else "inline"}; filename="{filename}"'
    url = await asyncio.to_thread(sign_url_sync, blob_path, disposition)
    return url, filename


async def signed_media(quote: dict[str, Any], project_id: str) -> list[dict[str, Any]]:
    """Dossier media with short-lived inline URLs (failures → url None)."""
    out: list[dict[str, Any]] = []
    for media in quote.get("media") or []:
        entry = dict(media)
        try:
            entry["url"], _ = await media_url(quote, project_id, str(media.get("media_id")), attachment=False)
        except Exception as exc:  # noqa: BLE001 — one broken media must not hide the dossier
            logger.warning("[AdminQuotes] Media URL failed", extra={"error_type": type(exc).__name__})
            entry["url"] = None
        out.append(entry)
    return out


async def revision_summaries(db: Any, project_id: str, limit: int = 50) -> list[dict[str, Any]]:
    revisions = quote_doc_ref(db, project_id).collection("revisions")
    rows: list[dict[str, Any]] = []
    async for doc in revisions.order_by("version", direction=Query.DESCENDING).limit(limit).stream():
        data = doc.to_dict() or {}
        rows.append(
            {
                "version": data.get("version"),
                "actor_kind": data.get("actor_kind"),
                "actor_uid": data.get("actor_uid"),
                "reason": data.get("reason"),
                "created_at": data.get("created_at"),
                "grand_total": (data.get("financials") or {}).get("grand_total"),
                "change_count": len(data.get("diff") or []),
            }
        )
    return rows


async def read_quote(db: Any, project_id: str) -> dict[str, Any]:
    snap = await quote_doc_ref(db, project_id).get()
    data = (snap.to_dict() or {}) if snap.exists else {}
    if not snap.exists or data.get("status") == QuoteStatus.DELETED:
        raise QuoteNotFoundError(project_id)
    return data
