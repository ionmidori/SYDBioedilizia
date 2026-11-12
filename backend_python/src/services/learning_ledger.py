"""Learning ledger (Phase 140 step 2): at each approval, the net correction of the
technician to the last AI draft, with the context the draft was made from.

Written in the approval transaction (`admin_quotes.approve_tx`): the approval and its
entry are committed together, and a Firestore error fails both (the transaction
retries). Reads come first: `prepare_entry` before any write, `write_entry` after.
An entry that cannot be built (no AI revision, a legacy document, no quote number)
never blocks the approval: it is skipped with a log carrying only the quote number.

Recording only: nothing reads the ledger automatically yet (rule proposals from ~30
quotes, calibration from ~100). Purge and retention never touch the collection.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from google.cloud.firestore_v1 import FieldFilter, Query
from pydantic import ValidationError

from src.core.money import sum_amounts
from src.schemas.learning_ledger import LearningLedgerEntry, LedgerRoom
from src.schemas.quote import QuoteItem, QuoteRequest, QuoteRevision
from src.services.quote_diff import diff_items
from src.services.quote_drafts import REVISIONS_SUBCOLLECTION

logger = logging.getLogger(__name__)

LEARNING_LEDGER_COLLECTION = "learning_ledger"
# How many revisions back (from the approved one) the last AI revision is looked for.
AI_REVISION_LOOKBACK = 20


def entry_id(quote_number: str, approved_version: int) -> str:
    """Deterministic: approving the same version again overwrites its entry."""
    return f"{quote_number}_r{approved_version}"


def ledger_ref(db: Any, doc_id: str) -> Any:
    return db.collection(LEARNING_LEDGER_COLLECTION).document(doc_id)


async def read_recent_revisions(transaction: Any, quote_ref: Any, up_to: int) -> list[dict[str, Any]]:
    """The last `AI_REVISION_LOOKBACK` revisions with version <= `up_to`, newest first
    (one-field query: no composite index)."""
    query = (
        quote_ref.collection(REVISIONS_SUBCOLLECTION)
        .where(filter=FieldFilter("version", "<=", up_to))
        .order_by("version", direction=Query.DESCENDING)
        .limit(AI_REVISION_LOOKBACK)
    )
    return [snap.to_dict() or {} for snap in await query.get(transaction=transaction)]


def last_ai_revision(revisions: list[dict[str, Any]]) -> dict[str, Any] | None:
    return next((r for r in revisions if r.get("actor_kind") == "ai"), None)


def build_entry(
    *, quote: dict[str, Any], ai_revision: dict[str, Any], approved_version: int, admin_uid: str, now: datetime
) -> LearningLedgerEntry | None:
    """The ledger entry of an approval. Pure, never raises: None if it cannot be built."""
    quote_number = quote.get("quote_number")
    if not quote_number:
        logger.warning("[LearningLedger] Quote without a number: no entry recorded.")
        return None
    try:
        draft = QuoteRevision(**ai_revision)
        approved_items = [QuoteItem(**item) for item in quote.get("items") or []]
        request = QuoteRequest(**(quote.get("request") or {}))
        return LearningLedgerEntry(
            quote_number=quote_number,
            approved_version=approved_version,
            ai_version=draft.version,
            approved_at=now,
            approved_by=admin_uid,
            ai_created_at=draft.created_at,
            rooms=[LedgerRoom.model_validate(room.model_dump(include=set(LedgerRoom.model_fields))) for room in draft.rooms],
            specs=draft.specs,
            ai_items=draft.items,
            approved_items=approved_items,
            changes=diff_items(
                [item.model_dump() for item in draft.items], [item.model_dump() for item in approved_items]
            ),
            manual_work=request.manual_work,
            ai_warnings=request.ai_warnings,
            ai_subtotal=sum_amounts(item.total for item in draft.items),
            approved_subtotal=sum_amounts(item.total for item in approved_items),
        )
    except ValidationError as exc:
        logger.warning(
            "[LearningLedger] Entry not recorded: invalid document.",
            extra={"quote_number": quote_number, "error_count": exc.error_count()},
        )
        return None


async def prepare_entry(
    transaction: Any, quote_ref: Any, quote: dict[str, Any], approved_version: int, admin_uid: str, now: datetime
) -> LearningLedgerEntry | None:
    """Read phase of the approval transaction: the entry to write, or None."""
    revisions = await read_recent_revisions(transaction, quote_ref, approved_version)
    ai_revision = last_ai_revision(revisions)
    if ai_revision is None:
        if len(revisions) == AI_REVISION_LOOKBACK:
            # More technician revisions than the window since the AI draft: worth knowing.
            logger.warning(
                "[LearningLedger] AI revision beyond the lookback window: no entry recorded.",
                extra={"quote_number": quote.get("quote_number"), "lookback": AI_REVISION_LOOKBACK},
            )
        else:
            # Quotes made before the AI drafts, or by hand: nothing to learn from.
            logger.info(
                "[LearningLedger] No AI revision to compare: no entry recorded.",
                extra={"quote_number": quote.get("quote_number")},
            )
        return None
    return build_entry(
        quote=quote, ai_revision=ai_revision, approved_version=approved_version, admin_uid=admin_uid, now=now
    )


def write_entry(transaction: Any, db: Any, entry: LearningLedgerEntry) -> None:
    """Write phase: amounts dump as JSON numbers (Firestore cannot store a Decimal)."""
    transaction.set(ledger_ref(db, entry_id(entry.quote_number, entry.approved_version)), entry.model_dump())
