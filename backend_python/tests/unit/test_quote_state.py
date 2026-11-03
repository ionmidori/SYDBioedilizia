"""Quote review state machine (Phase 128): every legal and illegal transition."""
import pytest
from src.core.exceptions import InvalidQuoteTransitionError
from src.services.quote_state import (
    TRANSITIONS,
    QuoteEvent,
    QuoteStatus,
    ai_draft_action,
    can_transition,
    status_label_it,
    transition,
)

S = QuoteStatus
E = QuoteEvent

EXPECTED = {
    (S.DRAFT, E.SUBMIT): S.PENDING_REVIEW,
    (S.PENDING_REVIEW, E.SUBMIT): S.PENDING_REVIEW,
    (S.DRAFT, E.OPEN): S.IN_REVIEW,
    (S.PENDING_REVIEW, E.OPEN): S.IN_REVIEW,
    (S.IN_REVIEW, E.OPEN): S.IN_REVIEW,
    (S.IN_REVIEW, E.RELEASE): S.PENDING_REVIEW,
    (S.DRAFT, E.EDIT): S.IN_REVIEW,
    (S.PENDING_REVIEW, E.EDIT): S.IN_REVIEW,
    (S.IN_REVIEW, E.EDIT): S.IN_REVIEW,
    (S.DRAFT, E.APPROVE): S.APPROVED,
    (S.PENDING_REVIEW, E.APPROVE): S.APPROVED,
    (S.IN_REVIEW, E.APPROVE): S.APPROVED,
    (S.DRAFT, E.REJECT): S.REJECTED,
    (S.PENDING_REVIEW, E.REJECT): S.REJECTED,
    (S.IN_REVIEW, E.REJECT): S.REJECTED,
    (S.REJECTED, E.REOPEN): S.IN_REVIEW,
    (S.APPROVED, E.REOPEN): S.IN_REVIEW,
    (S.APPROVED, E.SEND): S.SENT,
    (S.SENT, E.RESEND): S.SENT,
    (S.SENT, E.REVISE): S.IN_REVIEW,
    # Phase 139 PR-3: a new request in the chat opens the next revision as a draft.
    (S.SENT, E.CLIENT_REVISE): S.DRAFT,
    (S.REJECTED, E.CLIENT_REVISE): S.DRAFT,
    **{(s, E.DELETE): S.DELETED for s in S if s is not S.DELETED},
}


def test_transition_table_is_exactly_the_documented_one():
    assert TRANSITIONS == EXPECTED


@pytest.mark.parametrize("status", list(S))
@pytest.mark.parametrize("event", list(E))
def test_every_pair_is_either_allowed_or_a_409(status, event):
    if (status, event) in EXPECTED:
        assert transition(status, event) is EXPECTED[(status, event)]
        assert can_transition(status, event)
    else:
        with pytest.raises(InvalidQuoteTransitionError) as exc:
            transition(status, event)
        assert exc.value.status_code == 409
        assert exc.value.error_code == "INVALID_TRANSITION"
        assert not can_transition(status, event)


def test_accepts_plain_strings_as_stored_in_firestore():
    assert transition("pending_review", "approve") is S.APPROVED


@pytest.mark.parametrize("status,event", [("delivered", "send"), ("approved", "teleport"), ("", "")])
def test_unknown_status_or_event_is_rejected_not_guessed(status, event):
    with pytest.raises(InvalidQuoteTransitionError):
        transition(status, event)


def test_sent_quote_cannot_be_approved_again_or_deleted_twice():
    assert not can_transition(S.SENT, E.APPROVE)
    assert not can_transition(S.DELETED, E.DELETE)
    assert not can_transition(S.APPROVED, E.EDIT)  # edits need a reopen first


@pytest.mark.parametrize(
    "status,expected",
    [
        (None, "create"),
        ("deleted", "create"),
        ("draft", "update"),
        ("sent", "revise"),
        ("rejected", "revise"),
        ("pending_review", "relay"),
        ("in_review", "relay"),
        ("approved", "relay"),  # approved, about to be sent: the team decides
        ("delivered", "relay"),  # legacy/unknown → never overwrite
    ],
)
def test_ai_draft_never_overwrites_the_work_of_the_team(status, expected):
    assert ai_draft_action(status) == expected


def test_a_sent_quote_whose_email_is_still_queued_is_not_revised():
    # Like the admin's revise: the previous email has not left yet.
    assert ai_draft_action("sent", delivery_status="queued") == "relay"
    # A failed send never reached the client either (client_quote_view: not yet out).
    assert ai_draft_action("sent", delivery_status="failed") == "relay"
    assert ai_draft_action("sent", delivery_status="delivered") == "revise"
    assert ai_draft_action("rejected", delivery_status="queued") == "revise"


def test_every_status_reads_in_italian():
    assert {status_label_it(s) for s in S} and all(status_label_it(s) for s in S)
    assert status_label_it("sent") == "inviato al cliente"
    assert status_label_it("delivered") == "in lavorazione dal team"  # legacy status
    assert status_label_it(None) == "in lavorazione dal team"
