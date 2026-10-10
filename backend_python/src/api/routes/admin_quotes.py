"""
Admin quote review API — /api/admin (Phase 128 PR 3.1).

Every route requires `require_admin` (Firebase custom claim role=admin, plus
MFA when ADMIN_REQUIRE_MFA is on). Content writes use optimistic concurrency:
the dossier answers with `ETag: "v{n}"`, PATCH/approve must send it back in
`If-Match` (428 without it, 409 if the quote changed meanwhile).

Logs carry the quote number, never the project id (= chat session id, an
access token for guests) nor client contact data.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, Header, Path, Query, Request, Response
from google.cloud.firestore_v1 import async_transactional
from src.auth.admin import has_second_factor, require_admin
from src.core.exceptions import InvalidQuoteTransitionError, ResourceNotFound
from src.core.rate_limit import limiter
from src.db.firebase_client import get_async_firestore_client
from src.schemas.admin_quote import (
    AdminMe,
    AdminQuoteList,
    AdminQuoteListItem,
    ClientLive,
    DossierMedia,
    EditQuoteBody,
    MediaUrlResponse,
    QuoteDossier,
    QuoteWriteResponse,
    ReasonBody,
    RevisionSummary,
)
from src.schemas.internal import UserSession
from src.schemas.quote import QuoteRevision, QuoteSchema
from src.services import admin_quotes as svc
from src.services.audit import AuditAction, AuditResourceType, emit_audit_event
from src.services.client_profile import get_client_profile
from src.services.pdf_service import PdfService
from src.services.quote_drafts import quote_doc_ref, revision_ref
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["Admin — Quotes"])

_PID = Path(..., min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_\-]+$")


def _write_response(result: svc.WriteResult, **extra: Any) -> QuoteWriteResponse:
    return QuoteWriteResponse(
        project_id=result.project_id,
        status=result.status,  # type: ignore[arg-type]  # validated by the state machine
        version=result.version,
        quote_number=result.quote_number,
        etag=svc.etag_for(result.version),
        **extra,
    )


def _audit(action: AuditAction, project_id: str, admin: UserSession, **metadata: Any) -> None:
    emit_audit_event(action, AuditResourceType.QUOTE, project_id, user_id=admin.uid, metadata=metadata or None)


# ── Identity ──────────────────────────────────────────────────────────────────


@router.get("/me", response_model=AdminMe)
@limiter.limit("120/minute")
async def admin_me(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    admin: UserSession = Depends(require_admin),
) -> AdminMe:
    """Used by the Next.js /admin server guard."""
    return AdminMe(uid=admin.uid, email=admin.email, role="admin", mfa=has_second_factor(admin.claims))


# ── Reads ─────────────────────────────────────────────────────────────────────


@router.get("/quotes", response_model=AdminQuoteList)
@limiter.limit("120/minute")
async def list_quotes(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    status: str | None = Query(None, description="Comma-separated statuses, or 'open' (draft+pending+in_review)"),
    q: str | None = Query(None, max_length=120, description="Quote number, a name token or an email"),
    cursor: str | None = Query(None, max_length=512),
    limit: int = Query(25, ge=1, le=100),
    admin: UserSession = Depends(require_admin),  # pyright: ignore[reportUnusedParameter]
) -> AdminQuoteList:
    statuses: list[str] | None = None
    if status == "open":
        statuses = list(svc.OPEN_STATUSES)
    elif status:
        statuses = [s.strip() for s in status.split(",") if s.strip()]
    rows, next_cursor = await svc.list_quotes(get_async_firestore_client(), statuses, q, limit, cursor)
    return AdminQuoteList(items=[AdminQuoteListItem(**r) for r in rows], next_cursor=next_cursor)


@router.get("/quotes/{project_id}", response_model=QuoteDossier)
@limiter.limit("120/minute")
async def get_dossier(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    response: Response,
    project_id: str = _PID,
    admin: UserSession = Depends(require_admin),  # pyright: ignore[reportUnusedParameter]
) -> QuoteDossier:
    """Everything the admin needs to decide: quote, client, request, media, history."""
    db = get_async_firestore_client()
    quote = await svc.read_quote(db, project_id)
    project_snap = await db.collection("projects").document(project_id).get()
    project = (project_snap.to_dict() or {}) if project_snap.exists else {}

    snapshot = quote.get("client_snapshot") or {}
    owner = quote.get("user_id") or project.get("userId") or ""
    media, revisions, live = await asyncio.gather(
        svc.signed_media(quote, project_id),
        svc.revision_summaries(db, project_id),
        get_client_profile(owner) if owner else asyncio.sleep(0, result=None),
    )
    client_live = None
    changed = False
    if live is not None and not live.is_guest:
        client_live = ClientLive(display_name=live.name or None, email=live.email or None, phone=live.phone or None)
        changed = bool(snapshot) and (
            (live.email or None) != snapshot.get("email") or (live.name or None) != snapshot.get("display_name")
        )

    etag = svc.etag_for(int(quote.get("version") or 1))
    response.headers["ETag"] = etag
    return QuoteDossier(
        project_id=project_id,
        project_name=project.get("name"),
        etag=etag,
        quote=QuoteSchema(**{**quote, "id": "quote"}),
        client_live=client_live,
        client_profile_changed=changed,
        media=[DossierMedia(**m) for m in media],
        revisions=[RevisionSummary(**r) for r in revisions if r.get("version")],
    )


@router.get("/quotes/{project_id}/revisions/{version}", response_model=QuoteRevision)
@limiter.limit("120/minute")
async def get_revision(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    project_id: str = _PID,
    version: int = Path(..., ge=1),
    admin: UserSession = Depends(require_admin),  # pyright: ignore[reportUnusedParameter]
) -> QuoteRevision:
    db = get_async_firestore_client()
    snap = await revision_ref(quote_doc_ref(db, project_id), version).get()
    if not snap.exists:
        raise ResourceNotFound(message="Revision not found.", detail={"version": version})
    return QuoteRevision(**(snap.to_dict() or {}))


@router.get("/quotes/{project_id}/media/{media_id}/url", response_model=MediaUrlResponse)
@limiter.limit("240/minute")
async def get_media_url(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    project_id: str = _PID,
    media_id: str = Path(..., min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_\-]+$"),
    disposition: str = Query("inline", pattern="^(inline|attachment)$"),
    admin: UserSession = Depends(require_admin),  # pyright: ignore[reportUnusedParameter]
) -> MediaUrlResponse:
    """Fresh 15-minute URL; with disposition=attachment the browser saves it as
    e.g. `PRV-2026-0042_foto-1.jpg`."""
    quote = await svc.read_quote(get_async_firestore_client(), project_id)
    url, filename = await svc.media_url(quote, project_id, media_id, attachment=disposition == "attachment")
    return MediaUrlResponse(url=url, filename=filename)


# ── Writes ────────────────────────────────────────────────────────────────────


async def _run(body: Any) -> Any:
    """Run a transaction body with automatic retries on contention."""
    db = get_async_firestore_client()

    @async_transactional
    async def _txn(transaction: Any) -> Any:
        return await body(transaction, db)

    return await _txn(db.transaction())


@router.post("/quotes/{project_id}/claim", response_model=QuoteWriteResponse)
@limiter.limit("60/minute")
async def claim_quote(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    project_id: str = _PID,
    admin: UserSession = Depends(require_admin),
) -> QuoteWriteResponse:
    now = utc_now()
    result = await _run(lambda tx, db: svc.claim_tx(tx, db, project_id, admin.uid, now))
    _audit(AuditAction.QUOTE_CLAIM, project_id, admin, quote_number=result.quote_number)
    return _write_response(result)


@router.post("/quotes/{project_id}/release", response_model=QuoteWriteResponse)
@limiter.limit("60/minute")
async def release_quote(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    project_id: str = _PID,
    admin: UserSession = Depends(require_admin),
) -> QuoteWriteResponse:
    now = utc_now()
    result = await _run(lambda tx, db: svc.release_tx(tx, db, project_id, admin.uid, now))
    _audit(AuditAction.QUOTE_RELEASE, project_id, admin, quote_number=result.quote_number)
    return _write_response(result)


@router.patch("/quotes/{project_id}", response_model=QuoteWriteResponse)
@limiter.limit("60/minute")
async def edit_quote(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    response: Response,
    body: EditQuoteBody,
    project_id: str = _PID,
    if_match: str | None = Header(None, alias="If-Match"),
    admin: UserSession = Depends(require_admin),
) -> QuoteWriteResponse:
    expected = svc.parse_if_match(if_match)
    now = utc_now()
    result = await _run(
        lambda tx, db: svc.edit_tx(
            tx,
            db,
            project_id,
            admin.uid,
            expected,
            now,
            items=body.items,
            admin_notes=body.admin_notes,
            vat_rate=body.vat_rate,
            reason=body.reason,
        )
    )
    _audit(AuditAction.QUOTE_EDIT, project_id, admin, quote_number=result.quote_number, version=result.version)
    response.headers["ETag"] = svc.etag_for(result.version)
    return _write_response(result)


@router.post("/quotes/{project_id}/approve", response_model=QuoteWriteResponse)
@limiter.limit("20/hour")
async def approve_quote(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    project_id: str = _PID,
    if_match: str | None = Header(None, alias="If-Match"),
    admin: UserSession = Depends(require_admin),
) -> QuoteWriteResponse:
    """Freeze the version the admin reviewed and render its PDF.

    Sending to the client is a separate step (Phase 4): approving never emails.
    """
    expected = svc.parse_if_match(if_match)
    now = utc_now()
    result, approved = await _run(lambda tx, db: svc.approve_tx(tx, db, project_id, admin.uid, expected, now))
    _audit(AuditAction.QUOTE_APPROVE, project_id, admin, quote_number=result.quote_number, version=result.version)
    pdf_ready, preview = await _render_pdf(project_id, approved, result.version)
    return _write_response(result, pdf_ready=pdf_ready, pdf_preview_url=preview)


@router.post("/quotes/{project_id}/pdf", response_model=QuoteWriteResponse)
@limiter.limit("20/hour")
async def regenerate_pdf(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    project_id: str = _PID,
    admin: UserSession = Depends(require_admin),
) -> QuoteWriteResponse:
    """Retry the PDF of an approved/sent quote (e.g. after a Storage hiccup)."""
    quote = await svc.read_quote(get_async_firestore_client(), project_id)
    status = quote.get("status")
    if status not in ("approved", "sent"):
        raise InvalidQuoteTransitionError(str(status), "pdf")
    version = int((quote.get("review") or {}).get("approved_revision") or quote.get("version") or 1)
    pdf_ready, preview = await _render_pdf(project_id, quote, version)
    _audit(AuditAction.QUOTE_PDF, project_id, admin, quote_number=quote.get("quote_number"), ok=pdf_ready)
    result = svc.WriteResult(project_id, str(status), version, quote.get("quote_number"))
    return _write_response(result, pdf_ready=pdf_ready, pdf_preview_url=preview)


@router.post("/quotes/{project_id}/reject", response_model=QuoteWriteResponse)
@limiter.limit("20/hour")
async def reject_quote(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    body: ReasonBody,
    project_id: str = _PID,
    admin: UserSession = Depends(require_admin),
) -> QuoteWriteResponse:
    now = utc_now()
    result = await _run(lambda tx, db: svc.reject_tx(tx, db, project_id, admin.uid, body.reason, now))
    _audit(AuditAction.QUOTE_REJECT, project_id, admin, quote_number=result.quote_number)
    return _write_response(result)


@router.post("/quotes/{project_id}/reopen", response_model=QuoteWriteResponse)
@limiter.limit("20/hour")
async def reopen_quote(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    body: ReasonBody,
    project_id: str = _PID,
    admin: UserSession = Depends(require_admin),
) -> QuoteWriteResponse:
    now = utc_now()
    result = await _run(lambda tx, db: svc.reopen_tx(tx, db, project_id, admin.uid, body.reason, now))
    _audit(AuditAction.QUOTE_REOPEN, project_id, admin, quote_number=result.quote_number)
    return _write_response(result)


# ── PDF helper ────────────────────────────────────────────────────────────────


async def _render_pdf(project_id: str, quote: dict[str, Any], version: int) -> tuple[bool, str | None]:
    """Generate + upload the PDF of `version`; record its path. Never raises:
    an approval stays valid if the PDF fails (retry with POST .../pdf)."""
    blob_path = svc.pdf_blob_path(project_id, quote.get("quote_number"), version)
    try:
        pdf_bytes = await asyncio.to_thread(PdfService().generate_pdf_bytes, svc.pdf_input(quote, project_id))
        await asyncio.to_thread(svc.upload_pdf_sync, pdf_bytes, blob_path)
        await quote_doc_ref(get_async_firestore_client(), project_id).update(
            {"pdf_blob_path": blob_path, "pdf_revision": version}
        )
        filename = f"Preventivo_{quote.get('quote_number') or 'SYD'}.pdf"
        preview = await asyncio.to_thread(svc.sign_url_sync, blob_path, f'inline; filename="{filename}"')
        return True, preview
    except Exception as exc:  # noqa: BLE001 — approval must survive a PDF failure
        logger.error(
            "[AdminQuotes] PDF generation failed",
            extra={"quote_number": quote.get("quote_number"), "error_type": type(exc).__name__},
        )
        return False, None
