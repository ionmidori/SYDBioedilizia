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
- `sent` / `rejected`      → the next revision of the same quote as a draft
                             (same number, `version + 1`, diff with the
                             previous one); what the client received stays;
- the team is working on it → no write; the caller relays the request to the
                             team (`quote_followup`).

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

from google.cloud.firestore_v1 import DELETE_FIELD, async_transactional

from src.schemas.quote import (
    QuoteFinancials,
    QuoteItem,
    QuoteRequest,
    QuoteRevision,
    QuoteRoom,
    QuoteSchema,
    RevisionActorType,
)
from src.services.client_profile import build_client_snapshot, build_search_keys, get_client_profile
from src.services.quote_diff import diff_items
from src.services.quote_dossier import DossierInputs
from src.services.quote_numbering import allocate_quote_number
from src.services.quote_state import QuoteEvent, QuoteStatus, ai_draft_action, transition
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

REVISIONS_SUBCOLLECTION = "revisions"
CLIENT_REVISION_REASON = "Nuova richiesta del cliente in chat"


class DraftSaveOutcome(StrEnum):
    CREATED = "created"
    UPDATED = "updated"
    REVISED = "revised"
    # Nothing written: the team is working on the quote.
    WITH_THE_TEAM = "with_the_team"


@dataclass(frozen=True)
class DraftSaveResult:
    outcome: DraftSaveOutcome
    status: str
    quote_number: str | None
    version: int
    # The client already received a version of this quote (a revision of it).
    sent_before: bool = False


@dataclass(frozen=True)
class QuoteStatusView:
    """Where the quote of a chat stands (no items): the agent's context and
    the quote tool's early exit read it outside any transaction."""
    status: str
    delivery_status: str | None
    quote_number: str | None
    version: int
    sent_before: bool


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
    rooms: list[QuoteRoom] | None = None,
) -> dict[str, Any]:
    return QuoteRevision(
        version=version,
        items=items,
        rooms=rooms or [],
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
    action = ai_draft_action(current_status, current.get("delivery_status"))
    current_version = int(current.get("version") or 1)
    sent_before = bool(current.get("sent_at"))

    if action == "relay":
        return DraftSaveResult(
            DraftSaveOutcome.WITH_THE_TEAM, str(current_status), current.get("quote_number"), current_version,
            sent_before,
        )

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
            build_revision(1, quote.items, quote.financials, None, "ai", None, when, rooms=quote.rooms),
        )
        return DraftSaveResult(DraftSaveOutcome.CREATED, "draft", number.formatted, 1)

    # "update" refreshes an unsubmitted draft; "revise" opens the next revision
    # of a sent/rejected quote. Both write the AI content as version n+1.
    version = current_version + 1
    updates: dict[str, Any] = {
        "items": [item.model_dump(exclude_none=True) for item in quote.items],
        # Replaced, not merged: a quote regenerated without rooms has no sections.
        "rooms": [room.model_dump(exclude_none=True) for room in quote.rooms],
        "financials": quote.financials.model_dump(),
        "user_id": quote.user_id,
        "doc_type": "quote",
        "updated_at": when,
        "version": version,
        "media": media,
        # Dotted paths: never wipe request fields written elsewhere.
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

    revision = build_revision(
        version, quote.items, quote.financials, current.get("admin_notes"), "ai", None, when, rooms=quote.rooms
    )
    if action == "revise":
        updates.update(_revision_updates(str(current_status)))
        revision["reason"] = CLIENT_REVISION_REASON
        revision["diff"] = [
            c.model_dump(exclude_none=True) for c in diff_items(current.get("items") or [], updates["items"])
        ]

    transaction.update(ref, updates)
    transaction.set(revision_ref(ref, version), revision)
    outcome = DraftSaveOutcome.REVISED if action == "revise" else DraftSaveOutcome.UPDATED
    return DraftSaveResult(outcome, "draft", quote_number, version, sent_before)


def _revision_updates(current_status: str) -> dict[str, Any]:
    """Back to a draft the client submits again, no longer approved. The sent
    copy (`sent_at`, PDF, deliveries) is untouched: the client keeps seeing the
    quote they received until the team sends the new revision."""
    return {
        "status": transition(current_status, QuoteEvent.CLIENT_REVISE).value,
        "admin_decision": DELETE_FIELD,
        "review.approved_revision": DELETE_FIELD,
        "review.approved_by": DELETE_FIELD,
        "review.approved_at": DELETE_FIELD,
        "client_followup": DELETE_FIELD,
        "client_revision": True,
    }


async def read_quote_status(db: Any, project_id: str) -> QuoteStatusView | None:
    """The quote of `project_id`, or None when there is none (or it was deleted)."""
    snap = await quote_doc_ref(db, project_id).get()
    data: dict[str, Any] = (snap.to_dict() or {}) if snap.exists else {}
    status = data.get("status")
    if not snap.exists or status == QuoteStatus.DELETED:
        return None
    return QuoteStatusView(
        status=str(status),
        delivery_status=data.get("delivery_status"),
        quote_number=data.get("quote_number"),
        version=int(data.get("version") or 1),
        sent_before=bool(data.get("sent_at")),
    )


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
        # quote_number is the correlation key: never the project id (= chat
        # session id, an access token for guests — CodeQL py/clear-text-logging).
        extra={"quote_number": result.quote_number, "status": result.status},
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
    except Exception as exc:  # noqa: BLE001 — never fail a completed claim on enrichment
        logger.warning(
            "[QuoteDraft] Quote owner refresh after claim failed", extra={"error_type": type(exc).__name__}
        )
