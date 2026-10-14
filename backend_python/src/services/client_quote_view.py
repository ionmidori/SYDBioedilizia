"""
What the CLIENT sees of a quote that was already sent and is being revised.

Once a quote has reached the client, revising it (admin console → «Rivedi
preventivo») must not change what the client sees until the new revision is
approved AND sent: the work in progress is confidential, and the client keeps
the offer they received — prices, PDF, status.

So while a quote that has `sent_at` is in any status other than `sent`
(in_review, approved-but-not-sent, rejected…), the client is served the last
revision that actually went out: the latest delivery that left the provider
(`sent`, `delivered`, `complained`) names its revision and PDF, and the
immutable `revisions/{n}` snapshot holds its items and totals.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.services.quote_drafts import quote_doc_ref, revision_ref

# Deliveries that left the provider: the client has (or had) that email.
_REACHED_CLIENT = ("sent", "delivered", "complained")


@dataclass(frozen=True)
class SentCopy:
    revision: int
    pdf_blob_path: str | None
    items: list[dict[str, Any]]
    financials: dict[str, Any]
    admin_notes: str | None
    sent_at: Any


def serves_sent_copy(quote: dict[str, Any]) -> bool:
    """True if the client must see the last sent revision instead of the live quote."""
    return bool(quote.get("sent_at")) and quote.get("status") not in ("sent", "deleted")


async def last_sent_copy(db: Any, project_id: str) -> SentCopy | None:
    """The last revision the client received, or None if it cannot be rebuilt."""
    quote_ref = quote_doc_ref(db, project_id)
    latest: dict[str, Any] | None = None
    async for snap in quote_ref.collection("deliveries").stream():
        delivery = snap.to_dict() or {}
        if delivery.get("status") not in _REACHED_CLIENT or not delivery.get("sent_at"):
            continue
        if latest is None or delivery["sent_at"] > latest["sent_at"]:
            latest = delivery
    if latest is None or latest.get("revision") is None:
        return None

    revision = int(latest["revision"])
    rev_snap = await revision_ref(quote_ref, revision).get()
    if not rev_snap.exists:
        return None
    rev = rev_snap.to_dict() or {}
    return SentCopy(
        revision=revision,
        pdf_blob_path=latest.get("pdf_blob_path"),
        items=list(rev.get("items") or []),
        financials=dict(rev.get("financials") or {}),
        admin_notes=rev.get("admin_notes"),
        sent_at=latest["sent_at"],
    )


def apply_sent_copy(quote: dict[str, Any], copy: SentCopy) -> dict[str, Any]:
    """The live quote as the client last received it (status `sent`)."""
    return {
        **quote,
        "status": "sent",
        "version": copy.revision,
        "items": copy.items,
        "financials": copy.financials,
        "admin_notes": copy.admin_notes,
        "pdf_blob_path": copy.pdf_blob_path,
        "pdf_revision": copy.revision,
        "sent_at": copy.sent_at,
        "delivery_status": "sent",
    }


async def client_view_source(db: Any, project_id: str, quote: dict[str, Any]) -> dict[str, Any]:
    """The quote document the client view is built from (see module docstring).

    If the sent revision cannot be rebuilt, the live quote is returned and the
    caller's usual masking applies (prices hidden, no PDF) — never the draft.
    """
    if not serves_sent_copy(quote):
        return quote
    copy = await last_sent_copy(db, project_id)
    return apply_sent_copy(quote, copy) if copy else quote
