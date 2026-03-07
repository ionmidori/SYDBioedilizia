"""
Unit tests for src/adk/adk_orchestrator.py — ADK streaming pipeline.

Verifies that the ADKOrchestrator.stream_chat() method correctly:
1. Processes ADK Event objects and yields Data Stream Protocol chunks
2. Filters out function_call and function_response events
3. Handles errors gracefully with stream_error
4. Does NOT require event.partial == True (B2 regression guard)

Mocking:
- Runner.run_async → returns mock Event objects
- vertexai.init → no-op (no GCP creds needed)
- Session service → InMemorySessionService
- Filters → pass-through
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_text_event(text: str, author: str = "syd_orchestrator", partial: bool = False):
    """Create a mock ADK Event with text content."""
    part = MagicMock()
    part.text = text
    part.function_call = None
    part.function_response = None

    content = MagicMock()
    content.parts = [part]

    event = MagicMock()
    event.content = content
    event.partial = partial
    event.author = author
    event.turn_complete = not partial
    event.event_type = None
    return event


def _make_function_call_event(name: str = "my_tool"):
    """Create a mock ADK Event with a function call."""
    fc = MagicMock()
    fc.name = name
    fc.args = {"param": "value"}   # Must be JSON-serializable
    fc.call_id = "call-test-123"   # Must be JSON-serializable

    part = MagicMock()
    part.text = None
    part.function_call = fc
    part.function_response = None

    content = MagicMock()
    content.parts = [part]

    event = MagicMock()
    event.content = content
    event.partial = False
    event.author = "syd_orchestrator"
    event.turn_complete = False
    event.event_type = None
    return event


def _make_function_response_event():
    """Create a mock ADK Event with a function response."""
    fr = MagicMock()
    fr.response = {"result": "ok"}    # Must be JSON-serializable
    fr.call_id = "fr-call-test-456"   # Must be JSON-serializable

    part = MagicMock()
    part.text = None
    part.function_call = None
    part.function_response = fr

    content = MagicMock()
    content.parts = [part]

    event = MagicMock()
    event.content = content
    event.partial = False
    event.author = "syd_orchestrator"
    event.turn_complete = False
    event.event_type = None
    return event


async def _async_iter(items):
    """Convert a list to an async iterator (simulates Runner.run_async)."""
    for item in items:
        yield item


async def _collect_chunks(async_gen) -> list[str]:
    """Collect all chunks from an async generator."""
    chunks = []
    async for chunk in async_gen:
        chunks.append(chunk)
    return chunks


def _make_orchestrator_with_events(events: list, session_exists: bool = True):
    """Create an ADKOrchestrator instance with mocked internals."""
    from src.adk.adk_orchestrator import ADKOrchestrator

    orch = ADKOrchestrator.__new__(ADKOrchestrator)
    orch.runner = MagicMock()
    orch.runner.run_async = MagicMock(return_value=_async_iter(events))
    return orch


def _make_request_and_user():
    """Create mock request and user objects."""
    req = MagicMock()
    req.session_id = "test-session-123"
    req.messages = [MagicMock(content="ciao")]
    req.message = None
    req.media_urls = []
    req.video_file_uris = []
    req.media_types = []

    user = MagicMock()
    user.uid = "test-user-abc"
    return req, user


# ── Shared patch decorator ───────────────────────────────────────────────────
# settings is lazily imported inside stream_chat via `from src.core.config import settings`
# so we must patch it at the config module level.
_PATCHES = [
    patch("src.adk.adk_orchestrator.get_session_service"),
    patch("src.adk.adk_orchestrator.get_conversation_repository"),
    patch("src.core.config.settings"),
]


def _setup_mocks(mock_get_session, mock_get_repo, mock_settings):
    """Configure common mocks."""
    mock_settings.GOOGLE_CLOUD_PROJECT = "test-project"
    mock_settings.ADK_LOCATION = "us-central1"
    mock_settings.ADK_CMEK_KEY_NAME = ""
    mock_settings.FIREBASE_STORAGE_BUCKET = "test.appspot.com"

    session_svc = AsyncMock()
    session_svc.get_session = AsyncMock(return_value=MagicMock())
    session_svc.create_session = AsyncMock()
    mock_get_session.return_value = session_svc

    repo = AsyncMock()
    repo.save_message = AsyncMock()
    mock_get_repo.return_value = repo


# ── Test Class ───────────────────────────────────────────────────────────────

class TestADKOrchestratorStreamChat:
    """Tests for ADKOrchestrator.stream_chat() event processing."""

    @patch("src.core.config.settings")
    @patch("src.adk.adk_orchestrator.get_conversation_repository")
    @patch("src.adk.adk_orchestrator.get_session_service")
    async def test_text_event_yields_data_stream_chunk(
        self, mock_get_session, mock_get_repo, mock_settings
    ):
        """A text event from the model must produce a Data Stream Protocol text chunk."""
        _setup_mocks(mock_get_session, mock_get_repo, mock_settings)

        text_event = _make_text_event("Ciao! Come posso aiutarti?", partial=False)
        orch = _make_orchestrator_with_events([text_event])
        req, user = _make_request_and_user()

        chunks = await _collect_chunks(orch.stream_chat(req, user))

        # Expected: [Status Chunk, Text Chunk]
        assert len(chunks) == 2, f"Expected 2 chunks (status + text), got {len(chunks)}"
        assert chunks[0].startswith("2:"), "First chunk must be status data"
        assert "analizzando" in chunks[0]
        assert chunks[1].startswith("0:"), f"Expected Data Stream text chunk, got: {chunks[1]}"
        assert "Ciao" in chunks[1]

    @patch("src.core.config.settings")
    @patch("src.adk.adk_orchestrator.get_conversation_repository")
    @patch("src.adk.adk_orchestrator.get_session_service")
    async def test_function_call_event_yields_tool_status_and_data(
        self, mock_get_session, mock_get_repo, mock_settings
    ):
        """Function call events must yield a tool-status chunk plus a tool-call data chunk."""
        _setup_mocks(mock_get_session, mock_get_repo, mock_settings)

        orch = _make_orchestrator_with_events([_make_function_call_event("pricing_engine")])
        req, user = _make_request_and_user()

        chunks = await _collect_chunks(orch.stream_chat(req, user))

        # Expected: [initial status, tool status, tool call data]
        assert len(chunks) == 3, f"Expected 3 chunks, got {len(chunks)}: {chunks}"
        assert chunks[0].startswith("2:")  # initial status
        assert chunks[1].startswith("2:")  # tool status
        assert chunks[2].startswith("9:")  # tool call data chunk

    @patch("src.core.config.settings")
    @patch("src.adk.adk_orchestrator.get_conversation_repository")
    @patch("src.adk.adk_orchestrator.get_session_service")
    async def test_function_response_event_yields_tool_result(
        self, mock_get_session, mock_get_repo, mock_settings
    ):
        """Function response events must yield a tool-result data chunk."""
        _setup_mocks(mock_get_session, mock_get_repo, mock_settings)

        orch = _make_orchestrator_with_events([_make_function_response_event()])
        req, user = _make_request_and_user()

        chunks = await _collect_chunks(orch.stream_chat(req, user))

        # Expected: [initial status, tool result data]
        assert len(chunks) == 2, f"Expected 2 chunks, got {len(chunks)}: {chunks}"
        assert chunks[0].startswith("2:")  # initial status
        assert chunks[1].startswith("a:")  # tool result chunk

    @patch("src.core.config.settings")
    @patch("src.adk.adk_orchestrator.get_conversation_repository")
    @patch("src.adk.adk_orchestrator.get_session_service")
    async def test_mixed_events_yield_tool_data_then_text(
        self, mock_get_session, mock_get_repo, mock_settings
    ):
        """FC → FR → Text sequence: all tool chunks + final text chunk are emitted."""
        _setup_mocks(mock_get_session, mock_get_repo, mock_settings)

        events = [
            _make_function_call_event("pricing_engine"),
            _make_function_response_event(),
            _make_text_event("Ecco il preventivo!", partial=False),
        ]
        orch = _make_orchestrator_with_events(events)
        req, user = _make_request_and_user()

        chunks = await _collect_chunks(orch.stream_chat(req, user))

        # Expected: initial_status + tool_status + tool_call + tool_result + text = 5
        assert len(chunks) == 5, f"Expected 5 chunks, got {len(chunks)}: {chunks}"
        assert "analizzando" in chunks[0]
        # Last chunk must be the text
        assert chunks[-1].startswith("0:")
        assert "preventivo" in chunks[-1]

    @patch("src.core.config.settings")
    @patch("src.adk.adk_orchestrator.get_conversation_repository")
    @patch("src.adk.adk_orchestrator.get_session_service")
    async def test_error_in_runner_yields_error_chunk(
        self, mock_get_session, mock_get_repo, mock_settings
    ):
        """If the ADK runner raises an exception, stream_chat must yield status then stream_error chunk."""
        _setup_mocks(mock_get_session, mock_get_repo, mock_settings)

        from src.adk.adk_orchestrator import ADKOrchestrator

        orch = ADKOrchestrator.__new__(ADKOrchestrator)
        orch.runner = MagicMock()

        orch.runner.run_async = MagicMock(side_effect=RuntimeError("Gemini API quota exceeded"))
        req, user = _make_request_and_user()

        chunks = await _collect_chunks(orch.stream_chat(req, user))

        # Expected: [Status Chunk, Error Chunk]
        assert len(chunks) >= 2, f"Expected status and error chunks, got {len(chunks)}"
        assert chunks[0].startswith("2:"), "First chunk must be status"
        assert chunks[1].startswith("3:"), f"Expected error chunk at index 1, got: {chunks[1]}"

    @patch("src.core.config.settings")
    @patch("src.adk.adk_orchestrator.get_conversation_repository")
    @patch("src.adk.adk_orchestrator.get_session_service")
    async def test_partial_false_events_are_not_dropped_regression(
        self, mock_get_session, mock_get_repo, mock_settings
    ):
        """
        B2 REGRESSION GUARD: Events with partial=False must NOT be silently dropped.
        """
        _setup_mocks(mock_get_session, mock_get_repo, mock_settings)

        event = _make_text_event("Risposta completa dal modello", partial=False)
        orch = _make_orchestrator_with_events([event])
        req, user = _make_request_and_user()

        chunks = await _collect_chunks(orch.stream_chat(req, user))

        assert len(chunks) == 2, f"Expected 2 chunks, got {len(chunks)}"
        assert "analizzando" in chunks[0]
        assert "Risposta" in chunks[1]
