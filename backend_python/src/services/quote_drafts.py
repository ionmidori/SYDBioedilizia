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
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any

from google.cloud.firestore_v1 import async_transactional

from src.schemas.quote import QuoteRequest, QuoteSchema
from src.services.quote_numbering import allocate_quote_number
from src.services.quote_state import ai_draft_action
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)


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


def _request_updates(request: QuoteRequest) -> dict[str, Any]:
    """Dotted field paths so an update never wipes request fields set elsewhere."""
    return {
        f"request.{key}": value
        for key, value in request.model_dump(exclude_none=True).items()
    }


async def apply_ai_draft(
    transaction: Any,
    db: Any,
    project_id: str,
    quote: QuoteSchema,
    request: QuoteRequest,
    when: datetime,
) -> DraftSaveResult:
    """Transaction body (reads first, then writes). Separate from the
    `@async_transactional` wrapper so the decision logic is unit-testable."""
    ref = quote_doc_ref(db, project_id)
    snap = await ref.get(transaction=transaction)
    current: dict[str, Any] = (snap.to_dict() or {}) if snap.exists else {}
    current_status = current.get("status") if snap.exists else None
    action = ai_draft_action(current_status)

    if action == "skip":
        return DraftSaveResult(DraftSaveOutcome.SKIPPED, str(current_status), current.get("quote_number"))

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
                "request": request.model_dump(exclude_none=True),
            }
        )
        # A soft-deleted quote is replaced wholesale: it was a different request.
        transaction.set(ref, payload)
        return DraftSaveResult(DraftSaveOutcome.CREATED, "draft", number.formatted)

    # action == "update": refresh the AI content of an unsubmitted draft.
    updates: dict[str, Any] = {
        "items": [item.model_dump(exclude_none=True) for item in quote.items],
        "financials": quote.financials.model_dump(),
        "user_id": quote.user_id,
        "doc_type": "quote",
        "updated_at": when,
        "version": int(current.get("version") or 1) + 1,
        **_request_updates(request),
    }
    quote_number = current.get("quote_number")
    if not quote_number:
        # Legacy draft created before numbering existed.
        number = await allocate_quote_number(transaction, db, when)
        quote_number = number.formatted
        updates.update({"quote_number": quote_number, "quote_year": number.year, "quote_seq": number.seq})
    transaction.update(ref, updates)
    return DraftSaveResult(DraftSaveOutcome.UPDATED, "draft", quote_number)


async def save_ai_draft(
    db: Any,
    project_id: str,
    quote: QuoteSchema,
    request: QuoteRequest,
    now: datetime | None = None,
) -> DraftSaveResult:
    """Create or refresh the AI draft for `project_id` atomically."""
    when = now or utc_now()

    @async_transactional
    async def _txn(transaction: Any) -> DraftSaveResult:
        return await apply_ai_draft(transaction, db, project_id, quote, request, when)

    result = await _txn(db.transaction())
    logger.info(
        "[QuoteDraft] AI draft %s",
        result.outcome.value,
        extra={"project_id": project_id, "quote_number": result.quote_number, "status": result.status},
    )
    return result
