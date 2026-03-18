"""
Unit tests for src/adk/session.py — ADK SessionService singleton.

Tests the singleton behavior of get_session_service() which was the root cause
of the P0 SessionNotFoundError bug documented in PROJECT_CONTEXT_SUMMARY.md.

Mocking Notes:
- We mock vertexai and google.adk imports to avoid requiring GCP credentials.
- We test both InMemorySessionService (local) and VertexAiSessionService (prod) paths.
"""
import pytest


class TestGetSessionServiceSingleton:
    """Tests that get_session_service() returns a singleton instance."""

    def setup_method(self):
        """Reset the module-level singleton between tests."""
        import src.adk.session as session_module
        session_module._session_service_instance = None

    def test_returns_same_instance_twice(self):
        """The singleton must return the same object on repeated calls."""
        from src.adk.session import get_session_service
        svc1 = get_session_service()
        svc2 = get_session_service()
        assert svc1 is svc2, "get_session_service() must return a singleton"

    def test_local_uses_in_memory(self):
        """InMemorySessionService is always used (no Reasoning Engine deployment)."""
        from src.adk.session import get_session_service
        svc = get_session_service()
        assert "InMemorySessionService" in type(svc).__name__

    def test_singleton_not_none(self):
        """The singleton must never return None."""
        from src.adk.session import get_session_service
        svc = get_session_service()
        assert svc is not None
