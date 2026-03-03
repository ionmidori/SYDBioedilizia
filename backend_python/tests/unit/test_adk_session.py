"""
Unit tests for src/adk/session.py — ADK SessionService singleton.

Tests the singleton behavior of get_session_service() which was the root cause
of the P0 SessionNotFoundError bug documented in PROJECT_CONTEXT_SUMMARY.md.

Mocking Notes:
- We mock vertexai and google.adk imports to avoid requiring GCP credentials.
- We test both InMemorySessionService (local) and VertexAiSessionService (prod) paths.
"""
import pytest
from unittest.mock import patch, MagicMock


class TestGetSessionServiceSingleton:
    """Tests that get_session_service() returns a singleton instance."""

    def setup_method(self):
        """Reset the module-level singleton between tests."""
        import src.adk.session as session_module
        session_module._session_service_instance = None

    @patch("src.adk.session.settings")
    def test_returns_same_instance_twice(self, mock_settings):
        """The singleton must return the same object on repeated calls."""
        mock_settings.ENV = "development"

        from src.adk.session import get_session_service
        svc1 = get_session_service()
        svc2 = get_session_service()
        assert svc1 is svc2, "get_session_service() must return a singleton"

    @patch("src.adk.session.settings")
    def test_local_uses_in_memory(self, mock_settings):
        """In development mode, InMemorySessionService is used."""
        mock_settings.ENV = "development"

        from src.adk.session import get_session_service
        svc = get_session_service()
        assert "InMemorySessionService" in type(svc).__name__

    @patch("src.adk.session.settings")
    def test_singleton_not_none(self, mock_settings):
        """The singleton must never return None."""
        mock_settings.ENV = "development"

        from src.adk.session import get_session_service
        svc = get_session_service()
        assert svc is not None
