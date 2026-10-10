"""
Quote review state machine (Phase 128 — admin HITL).

Pure functions, no I/O: every writer of `projects/{pid}/private_data/quote`
asks this module whether a status change is legal before touching Firestore.

Why a domain state machine and not an ADK pause: the admin review can take
hours or days, while ADK Tool Confirmation expects an immediate answer and
keeps the agent invocation suspended. The agent only creates and submits the
draft; the review lives here, persisted in Firestore.

    draft ──submit──▶ pending_review ──open──▶ in_review ──release──▶ pending_review
    draft|pending_review|in_review ──edit──▶ in_review          (new revision)
    draft|pending_review|in_review ──approve──▶ approved
    draft|pending_review|in_review ──reject──▶ rejected
    rejected|approved ──reopen──▶ in_review
    approved ──send──▶ sent ──resend──▶ sent
    sent ──revise──▶ in_review                                  (rev. n+1)
    any (except deleted) ──delete──▶ deleted

The admin may act on a `draft` the client never submitted (e.g. the client
called on the phone): blocking that was the "Bozza can't be approved" bug.
"""
from __future__ import annotations

from enum import StrEnum
from typing import Literal

from src.core.exceptions import InvalidQuoteTransitionError


class QuoteStatus(StrEnum):
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    IN_REVIEW = "in_review"
    APPROVED = "approved"
    SENT = "sent"
    REJECTED = "rejected"
    DELETED = "deleted"


class QuoteEvent(StrEnum):
    SUBMIT = "submit"
    OPEN = "open"
    RELEASE = "release"
    EDIT = "edit"
    APPROVE = "approve"
    REJECT = "reject"
    REOPEN = "reopen"
    SEND = "send"
    RESEND = "resend"
    REVISE = "revise"
    DELETE = "delete"


_S = QuoteStatus
_E = QuoteEvent

_REVIEWABLE = (_S.DRAFT, _S.PENDING_REVIEW, _S.IN_REVIEW)

TRANSITIONS: dict[tuple[QuoteStatus, QuoteEvent], QuoteStatus] = {
    (_S.DRAFT, _E.SUBMIT): _S.PENDING_REVIEW,
    # Re-submitting an already pending quote (new batch) is idempotent.
    (_S.PENDING_REVIEW, _E.SUBMIT): _S.PENDING_REVIEW,
    (_S.DRAFT, _E.OPEN): _S.IN_REVIEW,
    (_S.PENDING_REVIEW, _E.OPEN): _S.IN_REVIEW,
    (_S.IN_REVIEW, _E.OPEN): _S.IN_REVIEW,
    (_S.IN_REVIEW, _E.RELEASE): _S.PENDING_REVIEW,
    **{(s, _E.EDIT): _S.IN_REVIEW for s in _REVIEWABLE},
    **{(s, _E.APPROVE): _S.APPROVED for s in _REVIEWABLE},
    **{(s, _E.REJECT): _S.REJECTED for s in _REVIEWABLE},
    (_S.REJECTED, _E.REOPEN): _S.IN_REVIEW,
    (_S.APPROVED, _E.REOPEN): _S.IN_REVIEW,
    (_S.APPROVED, _E.SEND): _S.SENT,
    (_S.SENT, _E.RESEND): _S.SENT,
    (_S.SENT, _E.REVISE): _S.IN_REVIEW,
    **{(s, _E.DELETE): _S.DELETED for s in QuoteStatus if s is not _S.DELETED},
}


def transition(current: QuoteStatus | str, event: QuoteEvent | str) -> QuoteStatus:
    """Return the status reached by applying `event`, or raise a 409.

    Unknown statuses (legacy documents) are rejected rather than guessed.
    """
    try:
        key = (QuoteStatus(current), QuoteEvent(event))
    except ValueError as exc:
        raise InvalidQuoteTransitionError(str(current), str(event)) from exc
    target = TRANSITIONS.get(key)
    if target is None:
        raise InvalidQuoteTransitionError(key[0].value, key[1].value)
    return target


def can_transition(current: QuoteStatus | str, event: QuoteEvent | str) -> bool:
    try:
        transition(current, event)
    except InvalidQuoteTransitionError:
        return False
    return True


AiDraftAction = Literal["create", "update", "skip"]


def ai_draft_action(current_status: str | None) -> AiDraftAction:
    """What an AI (re)generation of the draft may do to the stored quote.

    - no quote, or a soft-deleted one → create a fresh draft (new number);
    - `draft` → update items/financials in place (number and admin notes kept);
    - anything else (submitted, in review, approved, sent, rejected, or an
      unknown legacy status) → do not write: the admin owns the quote now.
    """
    if current_status is None or current_status == QuoteStatus.DELETED:
        return "create"
    if current_status == QuoteStatus.DRAFT:
        return "update"
    return "skip"
