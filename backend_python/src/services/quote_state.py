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
    sent|rejected ──client_revise──▶ draft      (rev. n+1, new request in chat)
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


# How the status reads in Italian to the client, the agent and the admin emails.
STATUS_LABEL_IT: dict[QuoteStatus, str] = {
    QuoteStatus.DRAFT: "in preparazione",
    QuoteStatus.PENDING_REVIEW: "inviato al team",
    QuoteStatus.IN_REVIEW: "in revisione dal team",
    QuoteStatus.APPROVED: "approvato, in invio",
    QuoteStatus.SENT: "inviato al cliente",
    QuoteStatus.REJECTED: "rifiutato",
    QuoteStatus.DELETED: "cancellato",
}


def status_label_it(status: str | None) -> str:
    try:
        return STATUS_LABEL_IT[QuoteStatus(status)]
    except ValueError:
        return "in lavorazione dal team"


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
    CLIENT_REVISE = "client_revise"
    DELETE = "delete"


_S = QuoteStatus
_E = QuoteEvent

_REVIEWABLE = (_S.DRAFT, _S.PENDING_REVIEW, _S.IN_REVIEW)

TRANSITIONS: dict[tuple[QuoteStatus, QuoteEvent], QuoteStatus] = {
    (_S.DRAFT, _E.SUBMIT): _S.PENDING_REVIEW,
    # Submitting an already pending quote again changes nothing.
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
    # The client asks for more work in the chat: the next revision starts as a
    # draft the client submits again; the quote already received stays valid.
    (_S.SENT, _E.CLIENT_REVISE): _S.DRAFT,
    (_S.REJECTED, _E.CLIENT_REVISE): _S.DRAFT,
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


AiDraftAction = Literal["create", "update", "revise", "relay"]


def ai_draft_action(current_status: str | None, delivery_status: str | None = None) -> AiDraftAction:
    """What an AI (re)generation of the draft may do to the stored quote.

    - no quote, or a soft-deleted one → create a fresh draft (new number);
    - `draft` → update items/financials in place (number and admin notes kept);
    - `sent` or `rejected` → open the next revision as a draft (same number),
      unless the email of a sent quote is still queued (as for the admin's
      revise: the client has not received that revision yet);
    - anything else (submitted, in review, approved, or an unknown legacy
      status) → the team is working on it: do not write the items, relay the
      request to the team instead.
    """
    if current_status is None or current_status == QuoteStatus.DELETED:
        return "create"
    if current_status == QuoteStatus.DRAFT:
        return "update"
    if current_status == QuoteStatus.SENT and delivery_status == "queued":
        return "relay"
    if current_status in (QuoteStatus.SENT, QuoteStatus.REJECTED):
        return "revise"
    return "relay"
