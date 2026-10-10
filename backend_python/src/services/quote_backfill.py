"""
Phase 128 / Fase 2 — give quotes created before the dossier existed their
PRV number and dossier (client snapshot, request, media, revision 1).

Rules (each quote, independently):
- only MISSING fields are added — nothing the admin or the pipeline wrote is
  overwritten; quotes that already have a number keep it;
- numbers are assigned in `created_at` order, inside one Firestore
  transaction per quote together with the counter (same counter as new
  drafts, so numbers never collide); soft-deleted quotes are not numbered;
- the result must validate against `QuoteSchema`: quotes that cannot be made
  valid (malformed legacy/test data) are reported and left untouched;
- every write is journaled in `migrations/quote_dossier_backfill/entries/{pid}`
  so `undo` removes exactly the added fields and the created revision.

Dossier data (Firebase Auth profile, Storage listing) is gathered outside the
transaction and is best-effort, like for new drafts.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from google.cloud.firestore_v1 import DELETE_FIELD, async_transactional
from pydantic import ValidationError

from src.schemas.quote import ClientSnapshot, QuoteSchema
from src.services.client_profile import build_search_keys
from src.services.quote_dossier import DossierInputs, gather_dossier_inputs
from src.services.quote_drafts import build_revision, quote_doc_ref, revision_ref
from src.services.quote_numbering import allocate_quote_number
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

MIGRATION_ID = "quote_dossier_backfill"
JOURNAL_COLLECTION = "migrations"


def journal_ref(db: Any, project_id: str) -> Any:
    return (
        db.collection(JOURNAL_COLLECTION).document(MIGRATION_ID).collection("entries").document(project_id)
    )


@dataclass
class QuotePlan:
    project_id: str
    action: str  # "backfill" | "ok" | "invalid" | "skip"
    created_at: datetime | None = None
    updates: dict[str, Any] = field(default_factory=dict)
    needs_number: bool = False
    needs_revision: bool = False
    issues: list[str] = field(default_factory=list)
    quote_number: str | None = None
    has_email: bool = False
    media_count: int = 0


def _missing(quote: dict[str, Any], key: str) -> bool:
    return quote.get(key) in (None, "", [], {})


def compute_updates(
    project_id: str,
    quote: dict[str, Any],
    project: dict[str, Any],
    dossier: DossierInputs,
) -> dict[str, Any]:
    """Missing fields to add (pure). Never returns a key already set on `quote`."""
    updates: dict[str, Any] = {}
    created = quote.get("created_at")

    if _missing(quote, "doc_type"):
        updates["doc_type"] = "quote"
    if _missing(quote, "project_id"):
        updates["project_id"] = project_id
    owner = project.get("userId")
    if _missing(quote, "user_id") and owner:
        updates["user_id"] = owner
    if quote.get("version") is None:
        updates["version"] = 1
    if _missing(quote, "updated_at") and created is not None:
        updates["updated_at"] = created
    if _missing(quote, "delivery_status"):
        updates["delivery_status"] = "none"

    # Legacy n8n callback wrote status="delivered" (a delivery outcome, not a
    # review state): the quote was sent and delivered.
    if quote.get("status") == "delivered":
        updates["status"] = "sent"
        updates["delivery_status"] = "delivered"

    if _missing(quote, "request"):
        request = {"session_id": project_id, **dossier.request_details}
        updates["request"] = request
    if _missing(quote, "client_snapshot") and dossier.client_snapshot is not None:
        updates["client_snapshot"] = dossier.client_snapshot.model_dump(exclude_none=True)
    if _missing(quote, "media") and dossier.media:
        updates["media"] = [m.model_dump(exclude_none=True) for m in dossier.media]
    return updates


def validate_result(quote: dict[str, Any], updates: dict[str, Any], placeholder_number: str | None) -> list[str]:
    """Errors of the document as it would be after the backfill ([] = valid)."""
    merged = {**quote, **updates}
    if placeholder_number:
        merged.update({"quote_number": placeholder_number, "quote_year": 2000, "quote_seq": 1})
    try:
        QuoteSchema(**merged)
    except ValidationError as exc:
        return [f"{'.'.join(str(p) for p in err['loc'])}: {err['type']}" for err in exc.errors()]
    return []


async def plan_all(db: Any, now: datetime | None = None, gather: Any = gather_dossier_inputs) -> list[QuotePlan]:
    """Read-only: one plan per existing quote, in numbering order."""
    when = now or utc_now()
    plans: list[QuotePlan] = []
    async for project_doc in db.collection("projects").stream():
        project_id = project_doc.id
        snap = await quote_doc_ref(db, project_id).get()
        if not snap.exists:
            continue
        quote = snap.to_dict() or {}
        project = project_doc.to_dict() or {}
        plan = QuotePlan(project_id=project_id, action="ok", created_at=quote.get("created_at"))
        if quote.get("status") == "deleted":
            plan.action = "skip"
            plans.append(plan)
            continue

        owner = quote.get("user_id") or project.get("userId") or ""
        dossier = await gather(db, project_id, owner, when) if owner else DossierInputs()
        plan.updates = compute_updates(project_id, quote, project, dossier)
        plan.needs_number = _missing(quote, "quote_number")
        # Snapshot the content in force as the revision of its current version.
        version = int(quote.get("version") or 1)
        revision = await revision_ref(quote_doc_ref(db, project_id), version).get()
        plan.needs_revision = not revision.exists
        plan.quote_number = quote.get("quote_number")

        plan.issues = validate_result(quote, plan.updates, "PRV-2000-0001" if plan.needs_number else None)
        if plan.issues:
            plan.action = "invalid"
        elif plan.updates or plan.needs_number or plan.needs_revision:
            plan.action = "backfill"

        snapshot = plan.updates.get("client_snapshot") or quote.get("client_snapshot") or {}
        plan.has_email = bool(snapshot.get("email"))
        plan.media_count = len(plan.updates.get("media") or quote.get("media") or [])
        plans.append(plan)

    epoch = datetime.min
    plans.sort(
        key=lambda p: (
            p.created_at is None,
            p.created_at.replace(tzinfo=None) if isinstance(p.created_at, datetime) else epoch,
            p.project_id,
        )
    )
    return plans


async def apply_plan(transaction: Any, db: Any, plan: QuotePlan, when: datetime) -> str | None:
    """Transaction body for one quote. Re-reads the quote so a concurrent
    numbering (new draft, earlier run) is never overwritten."""
    ref = quote_doc_ref(db, plan.project_id)
    snap = await ref.get(transaction=transaction)
    quote = (snap.to_dict() or {}) if snap.exists else {}
    if not snap.exists or quote.get("status") == "deleted":
        return None
    updates = {k: v for k, v in plan.updates.items() if _missing(quote, k)}
    if quote.get("status") == "delivered":  # legacy n8n callback, see compute_updates
        updates.update({"status": "sent", "delivery_status": "delivered"})
    quote_number = quote.get("quote_number")
    if not quote_number:
        number = await allocate_quote_number(transaction, db, quote.get("created_at") or when)
        quote_number = number.formatted
        updates.update({"quote_number": quote_number, "quote_year": number.year, "quote_seq": number.seq})

    snapshot_data = updates.get("client_snapshot") or quote.get("client_snapshot")
    snapshot = ClientSnapshot(**snapshot_data) if snapshot_data else None
    keys = build_search_keys(quote_number, snapshot)
    if _missing(quote, "search_keys") and keys:
        updates["search_keys"] = keys

    merged = QuoteSchema(**{**quote, **updates})
    revision_version = int(merged.version)
    if updates:
        transaction.update(ref, updates)
    if plan.needs_revision:
        transaction.set(
            revision_ref(ref, revision_version),
            build_revision(
                int(merged.version),
                merged.items,
                merged.financials,
                merged.admin_notes,
                "system",
                None,
                when,
                reason="Backfill Phase 128: stato del preventivo prima del dossier",
            ),
        )
    transaction.set(
        journal_ref(db, plan.project_id),
        {
            "fields": sorted(updates),
            "revision_created": plan.needs_revision,
            "revision_version": revision_version,
            "quote_number": quote_number,
            "applied_at": when,
            "previous_status": quote.get("status"),
            "previous_delivery_status": quote.get("delivery_status"),
        },
    )
    return quote_number


async def apply_all(db: Any, plans: list[QuotePlan], now: datetime | None = None) -> list[tuple[str, str | None]]:
    when = now or utc_now()
    done: list[tuple[str, str | None]] = []
    for plan in plans:
        if plan.action != "backfill":
            continue

        @async_transactional
        async def _txn(transaction: Any, plan: QuotePlan = plan) -> str | None:
            return await apply_plan(transaction, db, plan, when)

        done.append((plan.project_id, await _txn(db.transaction())))
    return done


async def undo_all(db: Any) -> int:
    """Remove exactly what the backfill added (numbers are not reused: gaps are allowed)."""
    undone = 0
    entries = db.collection(JOURNAL_COLLECTION).document(MIGRATION_ID).collection("entries")
    async for entry in entries.stream():
        data = entry.to_dict() or {}
        ref = quote_doc_ref(db, entry.id)
        snap = await ref.get()
        if snap.exists:
            reverted: dict[str, Any] = {name: DELETE_FIELD for name in data.get("fields", [])}
            if "status" in reverted:
                reverted["status"] = data.get("previous_status")
            if "delivery_status" in reverted and data.get("previous_delivery_status") is not None:
                reverted["delivery_status"] = data["previous_delivery_status"]
            if reverted:
                await ref.update(reverted)
            if data.get("revision_created"):
                await revision_ref(ref, int(data.get("revision_version") or 1)).delete()
        await entry.reference.delete()
        undone += 1
    return undone
