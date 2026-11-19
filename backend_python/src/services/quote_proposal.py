"""AI revision proposal for the team (relay plan, PR 3).

When the team has the quote (`quote_state.ai_draft_action` → "relay"), a change
asked in the chat is still analysed like a first quote, but the result is never
written on the quote, on the room specs or on the card: it is stored apart, at
projects/{pid}/private_data/quote_proposal (one doc, replaced at each request),
by `quote_followup.relay_tx` in the same transaction that records the request,
and the admin email carries its price range. The team decides whether to apply it.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from google.api_core.exceptions import GoogleAPIError
from pydantic import ValidationError

from src.schemas.admin_quote import QuoteProposal
from src.schemas.price_range import PriceEstimate
from src.services.email_templates import ProposalDigest
from src.services.quote_build import BuiltDraft

logger = logging.getLogger(__name__)

PROPOSAL_DOC_ID = "quote_proposal"


@dataclass(frozen=True)
class ProposalDraft:
    """What the chat analysed: the draft it would have written, and its summary."""
    built: BuiltDraft
    summary: str


def proposal_ref(db: Any, project_id: str) -> Any:
    return db.collection("projects").document(project_id).collection("private_data").document(PROPOSAL_DOC_ID)


def to_proposal(draft: ProposalDraft, *, version: int, now: datetime) -> QuoteProposal:
    quote = draft.built.quote
    return QuoteProposal(
        based_on_version=version, created_at=now, summary=draft.summary,
        items=quote.items, rooms=quote.rooms, financials=quote.financials,
        estimate=quote.estimate if isinstance(quote.estimate, PriceEstimate) else None,
        manual_work=draft.built.manual_work, ai_warnings=draft.built.ai_warnings, specs=draft.built.specs,
    )


def proposal_payload(proposal: QuoteProposal) -> dict[str, Any]:
    """The Firestore doc: the specs are written explicitly (excluded from the API)."""
    return proposal.model_dump(exclude_none=True) | {"specs": [spec.model_dump() for spec in proposal.specs]}


def proposal_digest(proposal: QuoteProposal, quote_rooms: list[dict[str, Any]]) -> ProposalDigest:
    """The proposal as the admin email shows it: range, lines, rooms the quote lacks."""
    known = {str(room.get("room_id")) for room in quote_rooms}
    return ProposalDigest(
        low=proposal.estimate.low if proposal.estimate else None,
        high=proposal.estimate.high if proposal.estimate else None,
        grand_total=proposal.financials.grand_total,
        item_count=len(proposal.items),
        new_rooms=[room.room_label for room in proposal.rooms if room.room_id not in known],
    )


async def read_proposal(db: Any, project_id: str) -> QuoteProposal | None:
    """The stored proposal, or None (none, or not readable: logged, the dossier still opens)."""
    try:
        snap = await proposal_ref(db, project_id).get()
        if not snap.exists:
            return None
        return QuoteProposal.model_validate(snap.to_dict() or {})
    except (GoogleAPIError, ValidationError) as exc:
        logger.warning("[QuoteProposal] Not readable", extra={"error_type": type(exc).__name__})
        return None
