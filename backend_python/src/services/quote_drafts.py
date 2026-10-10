"""
Persist an AI-generated quote draft without clobbering the admin's work.

Before Phase 128 `suggest_quote_items` did a plain `set()` on
`projects/{pid}/private_data/quote`: a second request in the chat silently
replaced items edited by the admin, and even reset an approved quote to
`draft`. Now the write runs in a Firestore transaction gated by
`quote_state.ai_draft_action`:

- no quote / soft-deleted  → create the draft and assign its PRV number;
- `draft`                  → update items + financials, keep number, notes
                             and creation date, bump `version`;
- any later status         → no write; the caller tells the client the
                             request is already with the team.

Every content change also writes an immutable revision
(`.../quote/revisions/{version}`), and the dossier data gathered outside the
transaction (client snapshot, site details, media) is stored with the draft.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any

from google.cloud.firestore_v1 import async_transactional

from src.schemas.quote import (
    QuoteFinancials,
    QuoteItem,
    QuoteRequest,
    QuoteRevision,
    QuoteSchema,
    RevisionActorType,
)
from src.services.client_profile import build_client_snapshot, build_search_keys, get_client_profile
from src.services.quote_dossier import DossierInputs
from src.services.quote_numbering import allocate_quote_number
from src.services.quote_state import ai_draft_action
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

REVISIONS_SUBCOLLECTION = "revisions"


class DraftSaveOutcome(StrEnum):
    CREATED = "created"
    UPDATED = "updated"
    SKIPPED = "skipped"


@dataclass(frozen=True)
class DraftSaveResult:
    outcome: DraftSaveOutcome
    status: str
    quote_number: str | None


def quote_doc_ref(db: Any, project_id: str) -> Any:
    return db.collection("projects").document(project_id).collection("private_data").document("quote")


def revision_ref(quote_ref: Any, version: int) -> Any:
    return quote_ref.collection(REVISIONS_SUBCOLLECTION).document(str(version))


def build_revision(
    version: int,
    items: list[QuoteItem],
    financials: QuoteFinancials,
    admin_notes: str | None,
    actor_kind: RevisionActorType,
    actor_uid: str | None,
    when: datetime,
    reason: str | None = None,
) -> dict[str, Any]:
    return QuoteRevision(
        version=version,
        items=items,
        financials=financials,
        admin_notes=admin_notes,
        actor_kind=actor_kind,
        actor_uid=actor_uid,
        reason=reason,
        created_at=when,
    ).model_dump(exclude_none=True)


def _merged_request(request: QuoteRequest, dossier: DossierInputs) -> dict[str, Any]:
    """Site details from the project, then what this generation knows."""
    merged = {**dossier.request_details, **request.model_dump(exclude_none=True)}
    return QuoteRequest(**merged).model_dump(exclude_none=True)


async def apply_ai_draft(
    transaction: Any,
    db: Any,
    project_id: str,
    quote: QuoteSchema,
    request: QuoteRequest,
    when: datetime,
    dossier: DossierInputs | None = None,
) -> DraftSaveResult:
    """Transaction body (reads first, then writes). Separate from the
    `@async_transactional` wrapper so the decision logic is unit-testable."""
    dossier = dossier or DossierInputs()
    ref = quote_doc_ref(db, project_id)
    snap = await ref.get(transaction=transaction)
    current: dict[str, Any] = (snap.to_dict() or {}) if snap.exists else {}
    current_status = current.get("status") if snap.exists else None
    action = ai_draft_action(current_status)

    if action == "skip":
        return DraftSaveResult(DraftSaveOutcome.SKIPPED, str(current_status), current.get("quote_number"))

    media = [m.model_dump(exclude_none=True) for m in dossier.media]

    if action == "create":
        number = await allocate_quote_number(transaction, db, when)
        payload = quote.model_dump(exclude_none=True)
        payload.update(
            {
                "status": "draft",
                "version": 1,
                "created_at": when,
                "updated_at": when,
                "quote_number": number.formatted,
                "quote_year": number.year,
                "quote_seq": number.seq,
                "request": _merged_request(request, dossier),
                "media": media,
                "search_keys": build_search_keys(number.formatted, dossier.client_snapshot),
            }
        )
        if dossier.client_snapshot is not None:
            payload["client_snapshot"] = dossier.client_snapshot.model_dump(exclude_none=True)
        # A soft-deleted quote is replaced wholesale: it was a different request.
        transaction.set(ref, payload)
        transaction.set(
            revision_ref(ref, 1),
            build_revision(1, quote.items, quote.financials, None, "ai", None, when),
        )
        return DraftSaveResult(DraftSaveOutcome.CREATED, "draft", number.formatted)

    # action == "update": refresh the AI content of an unsubmitted draft.
    version = int(current.get("version") or 1) + 1
    updates: dict[str, Any] = {
        "items": [item.model_dump(exclude_none=True) for item in quote.items],
        "financials": quote.financials.model_dump(),
        "user_id": quote.user_id,
        "doc_type": "quote",
        "updated_at": when,
        "version": version,
        "media": media,
        # Dotted paths: never wipe request fields written elsewhere (batch_id…).
        **{f"request.{k}": v for k, v in _merged_request(request, dossier).items()},
    }
    quote_number = current.get("quote_number")
    if not quote_number:
        # Legacy draft created before numbering existed.
        number = await allocate_quote_number(transaction, db, when)
        quote_number = number.formatted
        updates.update({"quote_number": quote_number, "quote_year": number.year, "quote_seq": number.seq})

    snapshot = dossier.client_snapshot
    if snapshot is not None:
        updates["client_snapshot"] = snapshot.model_dump(exclude_none=True)
    updates["search_keys"] = build_search_keys(quote_number, snapshot)

    transaction.update(ref, updates)
    transaction.set(
        revision_ref(ref, version),
        build_revision(version, quote.items, quote.financials, current.get("admin_notes"), "ai", None, when),
    )
    return DraftSaveResult(DraftSaveOutcome.UPDATED, "draft", quote_number)


async def save_ai_draft(
    db: Any,
    project_id: str,
    quote: QuoteSchema,
    request: QuoteRequest,
    now: datetime | None = None,
    dossier: DossierInputs | None = None,
) -> DraftSaveResult:
    """Create or refresh the AI draft for `project_id` atomically."""
    when = now or utc_now()

    @async_transactional
    async def _txn(transaction: Any) -> DraftSaveResult:
        return await apply_ai_draft(transaction, db, project_id, quote, request, when, dossier)

    result = await _txn(db.transaction())
    logger.info(
        "[QuoteDraft] AI draft %s",
        result.outcome.value,
        extra={"project_id": project_id, "quote_number": result.quote_number, "status": result.status},
    )
    return result


async def refresh_quote_owner(db: Any, project_id: str, new_user_id: str) -> None:
    """After a guest → registered claim: point the quote at the new owner and
    refresh the client snapshot (the guest had no name/email). Best-effort:
    the claim itself already succeeded."""
    ref = quote_doc_ref(db, project_id)
    try:
        snap = await ref.get()
        if not snap.exists:
            return
        data = snap.to_dict() or {}
        profile = await get_client_profile(new_user_id)
        snapshot = build_client_snapshot(new_user_id, profile, utc_now())
        await ref.update(
            {
                "user_id": new_user_id,
                "client_snapshot": snapshot.model_dump(exclude_none=True),
                "search_keys": build_search_keys(data.get("quote_number"), snapshot),
            }
        )
    except Exception:  # noqa: BLE001 — never fail a completed claim on enrichment
        logger.warning("[QuoteDraft] Quote owner refresh after claim failed", extra={"project_id": project_id})
