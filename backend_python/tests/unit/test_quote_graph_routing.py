"""
Quote Graph Routing Logic Tests — Phase B.

Tests the conditional edge function _route_after_review() that determines
the quote workflow path based on admin_decision field.

Pattern: Direct function testing with no external dependencies.
"""
import pytest
from langgraph.graph import END

from src.graph.quote_graph import _route_after_review
from src.graph.quote_state import QuoteState


class TestRouteAfterReview:
    """Test conditional routing logic after admin_review node."""

    def test_route_approve_to_finalize(self):
        """Decision 'approve' routes to 'finalize' node."""
        state: QuoteState = {
            "project_id": "test-project",
            "admin_decision": "approve",
            "admin_notes": "Approved by admin",
            "ai_draft": {},
            "pdf_url": "",
        }
        result = _route_after_review(state)
        assert result == "finalize"

    def test_route_reject_to_end(self):
        """Decision 'reject' routes to END (terminates workflow)."""
        state: QuoteState = {
            "project_id": "test-project",
            "admin_decision": "reject",
            "admin_notes": "Rejected due to budget constraints",
            "ai_draft": {},
            "pdf_url": "",
        }
        result = _route_after_review(state)
        assert result == END

    def test_route_edit_to_end(self):
        """Decision 'edit' routes to END (edit is not yet implemented)."""
        state: QuoteState = {
            "project_id": "test-project",
            "admin_decision": "edit",
            "admin_notes": "Need to edit the quote",
            "ai_draft": {},
            "pdf_url": "",
        }
        result = _route_after_review(state)
        assert result == END

    def test_route_none_decision_to_end(self):
        """Decision None (awaiting admin input) routes to END."""
        state: QuoteState = {
            "project_id": "test-project",
            "admin_decision": None,
            "admin_notes": "",
            "ai_draft": {},
            "pdf_url": "",
        }
        result = _route_after_review(state)
        assert result == END

    def test_route_missing_decision_to_end(self):
        """Missing admin_decision key routes to END (defaults to None)."""
        state: QuoteState = {
            "project_id": "test-project",
            "ai_draft": {},
            "pdf_url": "",
        }
        result = _route_after_review(state)
        assert result == END

    def test_route_invalid_decision_to_end(self):
        """Invalid decision value (not approve/reject/edit) routes to END."""
        state: QuoteState = {
            "project_id": "test-project",
            "admin_decision": "invalid_decision",  # type: ignore
            "admin_notes": "",
            "ai_draft": {},
            "pdf_url": "",
        }
        result = _route_after_review(state)
        assert result == END

    def test_route_empty_string_decision_to_end(self):
        """Empty string decision routes to END (falsy value)."""
        state: QuoteState = {
            "project_id": "test-project",
            "admin_decision": "",  # type: ignore
            "admin_notes": "",
            "ai_draft": {},
            "pdf_url": "",
        }
        result = _route_after_review(state)
        assert result == END
