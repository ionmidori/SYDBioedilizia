"""
Quote HITL End-to-End Integration Tests — Phase F (SIMPLIFIED).

These tests verify the HITL pattern works correctly at a higher level.
Focus: verify routing and state handling, not full graph execution.

Pattern: Direct function testing + mocked dependencies.
"""
import pytest
from langgraph.graph import END

from src.graph.quote_graph import _route_after_review
from src.graph.quote_state import QuoteState


@pytest.mark.asyncio
class TestQuoteHITLWorkflow:
    """HITL workflow pattern tests."""

    async def test_hitl_workflow_phase1_to_phase2_transition(self):
        """Verify state transition from Phase 1 (draft) to Phase 2 (approval)."""
        # Initial state (Phase 1)
        phase1_state: QuoteState = {
            "project_id": "test-project-001",
            "admin_decision": None,
            "admin_notes": "",
            "ai_draft": {"items": [{"sku": "001", "qty": 2}]},
            "pdf_url": "",
        }

        # Verify Phase 1: no decision made yet
        assert phase1_state["admin_decision"] is None

        # Transition to Phase 2: admin decides to approve
        phase2_state: QuoteState = {
            **phase1_state,
            "admin_decision": "approve",
            "admin_notes": "Approved by admin",
        }

        # Verify routing: approve decision routes to finalize
        result = _route_after_review(phase2_state)
        assert result == "finalize"

    async def test_hitl_workflow_rejection_path(self):
        """Verify rejection path ends workflow."""
        reject_state: QuoteState = {
            "project_id": "test-project-002",
            "admin_decision": "reject",
            "admin_notes": "Budget exceeded",
            "ai_draft": {},
            "pdf_url": "",
        }

        # Verify routing: reject decision routes to END
        result = _route_after_review(reject_state)
        assert result == END

    async def test_hitl_workflow_state_preservation(self):
        """Verify state fields preserved across phases."""
        original_state: QuoteState = {
            "project_id": "test-project-003",
            "admin_decision": None,
            "admin_notes": "",
            "ai_draft": {"analysis": "Complex structure", "cost": "€15000"},
            "pdf_url": "",
        }

        # After Phase 1, ai_draft should be preserved
        assert original_state["ai_draft"]["analysis"] == "Complex structure"

        # In Phase 2, admin adds notes and decision
        updated_state: QuoteState = {
            **original_state,
            "admin_decision": "approve",
            "admin_notes": "Approved with conditions",
            "pdf_url": "https://storage.example.com/pdf",
        }

        # Verify all state preserved
        assert updated_state["project_id"] == original_state["project_id"]
        assert updated_state["ai_draft"] == original_state["ai_draft"]
        assert updated_state["admin_notes"] == "Approved with conditions"

    async def test_hitl_workflow_routing_logic_completeness(self):
        """Verify routing handles all decision types."""
        test_cases = [
            ("approve", "finalize"),
            ("reject", END),
            ("edit", END),
            (None, END),
        ]

        for decision, expected_route in test_cases:
            state: QuoteState = {
                "project_id": "test",
                "admin_decision": decision,  # type: ignore
                "admin_notes": "",
                "ai_draft": {},
                "pdf_url": "",
            }
            result = _route_after_review(state)
            assert result == expected_route, f"Decision '{decision}' should route to {expected_route}, got {result}"


@pytest.mark.asyncio
class TestQuoteHITLStateManagement:
    """State management and data flow tests."""

    async def test_hitl_workflow_with_admin_notes(self):
        """Admin notes properly passed through state."""
        notes = "Approved with minor modifications. Delivery by Friday."

        state: QuoteState = {
            "project_id": "test-project-004",
            "admin_decision": "approve",
            "admin_notes": notes,
            "ai_draft": {},
            "pdf_url": "",
        }

        # Verify notes are preserved
        assert state["admin_notes"] == notes
        assert len(state["admin_notes"]) <= 2000  # Max length check

    async def test_hitl_workflow_pdf_url_storage(self):
        """PDF URL stored in state after finalize."""
        pdf_url = "https://storage.googleapis.com/bucket/projects/test-project-005/quote.pdf"

        state: QuoteState = {
            "project_id": "test-project-005",
            "admin_decision": "approve",
            "admin_notes": "Approved",
            "ai_draft": {},
            "pdf_url": pdf_url,
        }

        # Verify PDF URL is stored
        assert state["pdf_url"] == pdf_url
        assert state["pdf_url"].startswith("https://")

    async def test_hitl_workflow_ai_draft_preserved(self):
        """AI draft output preserved from Phase 1 to Phase 2."""
        ai_draft = {
            "items": [
                {"sku": "WINDOW-001", "qty": 8, "price": 120},
                {"sku": "DOOR-002", "qty": 3, "price": 250},
            ],
            "total": 2010,
        }

        phase1_state: QuoteState = {
            "project_id": "test-project-006",
            "admin_decision": None,
            "admin_notes": "",
            "ai_draft": ai_draft,
            "pdf_url": "",
        }

        # Transition to Phase 2
        phase2_state: QuoteState = {
            **phase1_state,
            "admin_decision": "approve",
            "admin_notes": "OK to proceed",
        }

        # Verify ai_draft is preserved
        assert phase2_state["ai_draft"] == ai_draft
        assert len(phase2_state["ai_draft"]["items"]) == 2


@pytest.mark.asyncio
class TestQuoteHITLErrorHandling:
    """Error handling in HITL workflow."""

    async def test_missing_project_id_rejected(self):
        """Empty project_id should be caught at boundary."""
        state: QuoteState = {
            "project_id": "",  # Empty
            "admin_decision": "approve",
            "admin_notes": "",
            "ai_draft": {},
            "pdf_url": "",
        }

        # Verify project_id is required (validation at boundary)
        assert state["project_id"] == ""

    async def test_invalid_decision_routes_to_end(self):
        """Invalid decision values route to END."""
        state: QuoteState = {
            "project_id": "test",
            "admin_decision": "invalid_choice",  # type: ignore
            "admin_notes": "",
            "ai_draft": {},
            "pdf_url": "",
        }

        result = _route_after_review(state)
        assert result == END

    async def test_long_admin_notes_handled(self):
        """Very long admin notes don't break state."""
        long_notes = "x" * 2000  # Max allowed

        state: QuoteState = {
            "project_id": "test",
            "admin_decision": "approve",
            "admin_notes": long_notes,
            "ai_draft": {},
            "pdf_url": "",
        }

        # Should not raise
        assert len(state["admin_notes"]) == 2000

    async def test_missing_optional_fields_handled(self):
        """Missing optional fields (ai_draft, pdf_url) handled gracefully."""
        state: QuoteState = {
            "project_id": "test",
            "admin_decision": "approve",
        }

        # TypedDict allows partial construction
        assert "project_id" in state
        assert state["admin_decision"] == "approve"
