"""
Orchestrator Interface Tests — Phase 0.

Verifies that the BaseOrchestrator ABC and its implementations satisfy the
dual-mode architecture contract required for the LangGraph → ADK migration.

Tests:
  - AgentOrchestrator correctly implements BaseOrchestrator
  - LangGraphOrchestrator is the canonical alias
  - OrchestratorFactory returns a BaseOrchestrator for all ORCHESTRATOR_MODE values
  - health_check() returns bool
  - ORCHESTRATOR_MODE default is "langgraph"
  - Unknown ORCHESTRATOR_MODE falls back gracefully (no exception)

Pattern: unit tests with mocked Firestore / get_agent_graph, no network calls.
"""

import pytest
from unittest.mock import MagicMock, patch


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_repo():
    """Minimal ConversationRepository mock."""
    return MagicMock()


# ─── 1. Class hierarchy ───────────────────────────────────────────────────────

def test_agent_orchestrator_is_subclass_of_base():
    """AgentOrchestrator must satisfy the BaseOrchestrator contract."""
    from src.services.base_orchestrator import BaseOrchestrator
    from src.services.agent_orchestrator import AgentOrchestrator

    assert issubclass(AgentOrchestrator, BaseOrchestrator)


def test_langgraph_orchestrator_is_canonical_alias():
    """LangGraphOrchestrator must be the same class as AgentOrchestrator."""
    from src.services.agent_orchestrator import AgentOrchestrator, LangGraphOrchestrator

    assert LangGraphOrchestrator is AgentOrchestrator


def test_agent_orchestrator_has_all_abstract_methods(mock_repo):
    """Concrete class must not raise TypeError on instantiation (all ABC methods implemented)."""
    from src.services.agent_orchestrator import AgentOrchestrator

    # Must not raise TypeError: Can't instantiate abstract class ...
    orchestrator = AgentOrchestrator(mock_repo)
    assert orchestrator is not None


# ─── 2. health_check() ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health_check_returns_true_when_graph_ok(mock_repo):
    """health_check() must return True when the LangGraph agent graph compiles."""
    from src.services.agent_orchestrator import AgentOrchestrator

    with patch("src.services.agent_orchestrator.get_agent_graph") as mock_graph:
        mock_graph.return_value = MagicMock()
        orchestrator = AgentOrchestrator(mock_repo)
        result = await orchestrator.health_check()

    assert result is True


@pytest.mark.asyncio
async def test_health_check_returns_false_when_graph_fails(mock_repo):
    """health_check() must return False when get_agent_graph raises an exception."""
    from src.services.agent_orchestrator import AgentOrchestrator

    with patch("src.services.agent_orchestrator.get_agent_graph", side_effect=RuntimeError("graph init failed")):
        orchestrator = AgentOrchestrator(mock_repo)
        result = await orchestrator.health_check()

    assert result is False


# ─── 3. resume_interrupt() ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_resume_interrupt_raises_not_implemented(mock_repo):
    """LangGraphOrchestrator.resume_interrupt() must raise NotImplementedError (handled by quote_routes)."""
    from src.services.agent_orchestrator import AgentOrchestrator

    orchestrator = AgentOrchestrator(mock_repo)
    with pytest.raises(NotImplementedError):
        await orchestrator.resume_interrupt("session-123", {"decision": "approve"})


# ─── 4. OrchestratorFactory ──────────────────────────────────────────────────

def test_factory_returns_base_orchestrator_for_langgraph(mock_repo):
    """Factory must return a BaseOrchestrator when ORCHESTRATOR_MODE=langgraph."""
    from src.services.base_orchestrator import BaseOrchestrator
    from src.services.orchestrator_factory import get_orchestrator
    from src.core.config import settings

    with patch.object(settings, "ORCHESTRATOR_MODE", "langgraph"):
        orchestrator = get_orchestrator(repo=mock_repo)

    assert isinstance(orchestrator, BaseOrchestrator)


def test_factory_falls_back_to_langgraph_for_vertex_adk(mock_repo):
    """Factory must fall back to LangGraphOrchestrator when vertex_adk not yet implemented."""
    from src.services.agent_orchestrator import LangGraphOrchestrator
    from src.services.orchestrator_factory import get_orchestrator
    from src.core.config import settings

    with patch.object(settings, "ORCHESTRATOR_MODE", "vertex_adk"):
        orchestrator = get_orchestrator(repo=mock_repo)

    assert isinstance(orchestrator, LangGraphOrchestrator)


def test_factory_falls_back_to_langgraph_for_unknown_mode(mock_repo):
    """Factory must not raise for unknown ORCHESTRATOR_MODE — fall back gracefully."""
    from src.services.agent_orchestrator import LangGraphOrchestrator
    from src.services.orchestrator_factory import get_orchestrator
    from src.core.config import settings

    with patch.object(settings, "ORCHESTRATOR_MODE", "completely_unknown_mode"):
        orchestrator = get_orchestrator(repo=mock_repo)

    assert isinstance(orchestrator, LangGraphOrchestrator)


# ─── 5. Config ────────────────────────────────────────────────────────────────

def test_orchestrator_mode_default_is_langgraph():
    """Settings default for ORCHESTRATOR_MODE must be 'langgraph'."""
    from src.core.config import Settings

    fresh = Settings(
        GOOGLE_CLOUD_PROJECT="test-project",
        GEMINI_API_KEY="test-key",
    )
    assert fresh.ORCHESTRATOR_MODE == "langgraph"
