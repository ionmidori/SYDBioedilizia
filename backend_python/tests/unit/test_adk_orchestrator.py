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


def _parse_sse(chunks: list[str]) -> list:
    """
    Parse the AI SDK v6 SSE byte stream produced by stream_chat into a list of
    decoded chunks (dicts, plus the literal "[DONE]" sentinel).
    """
    import json
    parsed = []
    for line in chunks:
        assert line.startswith("data: "), f"not an SSE data line: {line!r}"
        body = line[len("data: "):].rstrip("\n")
        parsed.append(body if body == "[DONE]" else json.loads(body))
    return parsed


def _types(parsed: list) -> list[str]:
    return [p["type"] if isinstance(p, dict) else p for p in parsed]


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
    async def test_text_event_yields_v6_text_delta(
        self, mock_get_session, mock_get_repo, mock_settings
    ):
        """A text event must produce an AI SDK v6 text-delta within the SSE lifecycle."""
        _setup_mocks(mock_get_session, mock_get_repo, mock_settings)

        text_event = _make_text_event("Ciao! Come posso aiutarti?", partial=False)
        orch = _make_orchestrator_with_events([text_event])
        req, user = _make_request_and_user()

        parsed = _parse_sse(await _collect_chunks(orch.stream_chat(req, user)))
        types = _types(parsed)

        # Lifecycle present
        assert types[0] == "start"
        assert types[-2:] == ["finish", "[DONE]"]
        # An initial status data part is emitted before any text
        status = next(p for p in parsed if isinstance(p, dict) and p.get("type") == "data-status")
        assert "analizzando" in status["data"]["message"]
        # Text is bracketed and carries the model output
        assert "text-start" in types and "text-end" in types
        delta = next(p for p in parsed if isinstance(p, dict) and p.get("type") == "text-delta")
        assert "Ciao" in delta["delta"]

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

        parsed = _parse_sse(await _collect_chunks(orch.stream_chat(req, user)))

        # Tool activity is emitted as transient data parts (data-status + data-tool_call)
        assert any(isinstance(p, dict) and p.get("type") == "data-status" for p in parsed)
        tool_call = next(p for p in parsed if isinstance(p, dict) and p.get("type") == "data-tool_call")
        assert tool_call["transient"] is True
        assert _types(parsed)[-2:] == ["finish", "[DONE]"]

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

        parsed = _parse_sse(await _collect_chunks(orch.stream_chat(req, user)))

        tool_result = next(p for p in parsed if isinstance(p, dict) and p.get("type") == "data-tool_result")
        assert tool_result["transient"] is True
        assert _types(parsed)[-2:] == ["finish", "[DONE]"]

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

        parsed = _parse_sse(await _collect_chunks(orch.stream_chat(req, user)))
        types = _types(parsed)

        # All tool data parts plus the final text part are present
        assert "data-tool_call" in types
        assert "data-tool_result" in types
        delta = next(p for p in parsed if isinstance(p, dict) and p.get("type") == "text-delta")
        assert "preventivo" in delta["delta"]
        # text-end must precede the finish frame
        assert types.index("text-end") < types.index("finish")
        assert types[-2:] == ["finish", "[DONE]"]

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

        parsed = _parse_sse(await _collect_chunks(orch.stream_chat(req, user)))
        types = _types(parsed)

        # An error frame must be surfaced, and the stream still finishes cleanly
        assert "error" in types, f"Expected an error chunk, got: {types}"
        assert types[-2:] == ["finish", "[DONE]"]

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

        parsed = _parse_sse(await _collect_chunks(orch.stream_chat(req, user)))

        # partial=False text must be present as a v6 text-delta (not dropped)
        delta = next(p for p in parsed if isinstance(p, dict) and p.get("type") == "text-delta")
        assert "Risposta" in delta["delta"]
