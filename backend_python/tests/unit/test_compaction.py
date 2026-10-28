"""
History compaction (Phase 138 PR-5): the room-by-room template and the
summarizer that never turns an answered turn into an error.
"""
import asyncio
import inspect
import string
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock, patch

import pytest
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event
from google.adk.events.event_actions import EventActions, EventCompaction
from google.adk.flows.llm_flows.context import _compaction as _compaction_module
from google.adk.flows.llm_flows.context._compaction import CompactionRequestProcessor, _process_compaction_events
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import errors as genai_errors
from google.genai import types
from src.adk.agents import syd_orchestrator
from src.adk.compaction import PostTurnCompactionPlugin, RoomAwareEventSummarizer, build_events_compaction_config
from src.core.config import settings
from src.prompts.components.compaction import COMPACTION_PROMPT_TEMPLATE


class _FakeLlm(BaseLlm):
    """Summarizer model: replies `reply`, raises `error`, or hangs."""

    reply: str = ""
    error: Exception | None = None
    hang: bool = False
    prompts: list[str] = []

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        self.prompts.append(llm_request.contents[0].parts[0].text or "")
        if self.hang:
            await asyncio.sleep(10)
        if self.error is not None:
            raise self.error
        yield LlmResponse(content=types.Content(role="model", parts=[types.Part(text=self.reply)]))


def _summarizer(llm: _FakeLlm, timeout: float = 5.0) -> RoomAwareEventSummarizer:
    summarizer = RoomAwareEventSummarizer(timeout_seconds=timeout)
    summarizer._llm = llm
    return summarizer


def _events() -> list[Event]:
    return [
        Event(author="user", content=types.Content(role="user", parts=[types.Part(
            text="###\nIl bagno è 2 x 2,5 m, pavimento 5 mq\n###\n[Foto f_bagno_1 · Bagno]"
        )])),
        Event(author="syd_orchestrator", content=types.Content(role="model", parts=[types.Part(text="Annotato.")])),
    ]


def test_template_has_only_the_conversation_history_placeholder():
    """It goes through str.format in ADK: any other brace would raise or be eaten."""
    fields = [name for _, name, _, _ in string.Formatter().parse(COMPACTION_PROMPT_TEMPLATE) if name is not None]
    assert fields == ["conversation_history"]
    assert COMPACTION_PROMPT_TEMPLATE.format(conversation_history="STORIA").rstrip().endswith("STORIA")


def test_template_is_organized_by_room_and_keeps_media_labels():
    assert "## Generale" in COMPACTION_PROMPT_TEMPLATE
    assert "## <Nome stanza>" in COMPACTION_PROMPT_TEMPLATE
    assert "[Foto f_123 · Bagno]" in COMPACTION_PROMPT_TEMPLATE
    assert "Ambienti citati ma non ancora creati" in COMPACTION_PROMPT_TEMPLATE


async def test_summary_becomes_a_compaction_event():
    llm = _FakeLlm(model="summarizer", reply="## Bagno\n- Misure: pavimento 5 mq")
    event = await _summarizer(llm).maybe_summarize_events(events=_events())

    assert event is not None and event.actions.compaction is not None
    content = event.actions.compaction.compacted_content
    assert content is not None and content.parts is not None
    assert content.parts[0].text == "## Bagno\n- Misure: pavimento 5 mq"
    # The history reached the model inside the room-by-room template, labels included.
    assert "[Foto f_bagno_1 · Bagno]" in llm.prompts[-1]
    assert llm.prompts[-1].startswith("Sei il sistema di memoria di SYD")


@pytest.mark.parametrize(
    "error",
    [
        genai_errors.ServerError(503, {"error": {"message": "unavailable"}}),
        genai_errors.ClientError(429, {"error": {"message": "quota"}}),
    ],
)
async def test_model_error_leaves_the_history_uncompacted(error, caplog):
    llm = _FakeLlm(model="summarizer", error=error)
    with caplog.at_level("WARNING"):
        assert await _summarizer(llm).maybe_summarize_events(events=_events()) is None
    record = next(r for r in caplog.records if getattr(r, "event", None) == "adk_compaction")
    assert record.outcome == f"error:{type(error).__name__}"


async def test_slow_model_is_cut_by_the_deadline(caplog):
    llm = _FakeLlm(model="summarizer", hang=True)
    with caplog.at_level("WARNING"):
        assert await _summarizer(llm, timeout=0.05).maybe_summarize_events(events=_events()) is None
    assert any(getattr(r, "outcome", None) == "timeout" for r in caplog.records)


async def test_empty_summary_is_not_a_compaction():
    llm = _FakeLlm(model="summarizer", reply="")
    assert await _summarizer(llm).maybe_summarize_events(events=_events()) is None


def test_config_comes_from_settings(monkeypatch):
    monkeypatch.setattr(settings, "ADK_COMPACTION_TOKEN_THRESHOLD", 12345)
    monkeypatch.setattr(settings, "ADK_COMPACTION_EVENT_RETENTION", 7)
    config = build_events_compaction_config()
    assert (config.token_threshold, config.event_retention_size) == (12345, 7)
    assert isinstance(config.summarizer, RoomAwareEventSummarizer)


def test_config_overrides_for_evals():
    config = build_events_compaction_config(token_threshold=8000, event_retention_size=0)
    assert (config.token_threshold, config.event_retention_size) == (8000, 0)


# ── Compaction only after the turn ───────────────────────────────────────────

async def _invocation_context(config) -> InvocationContext:
    service = InMemorySessionService()
    session = await service.create_session(app_name="syd_orchestrator", user_id="u1")
    return InvocationContext(
        session_service=service, invocation_id="inv1", agent=syd_orchestrator, session=session,
        events_compaction_config=config,
    )


async def test_plugin_turns_off_the_compaction_inside_the_turn():
    """ADK compacts before every model call once the last prompt reached the
    threshold: synchronous (first token waits) and able to summarize away the
    current user message. The plugin leaves only the post-turn compaction."""
    ctx = await _invocation_context(build_events_compaction_config(token_threshold=1, event_retention_size=0))
    assert await PostTurnCompactionPlugin().before_run_callback(invocation_context=ctx) is None
    assert ctx.events_compaction_config is None

    with patch.object(_compaction_module, "_run_compaction_for_token_threshold_config", new=AsyncMock()) as run:
        async for _ in CompactionRequestProcessor().run_async(ctx, LlmRequest()):
            pass
    run.assert_not_awaited()


def test_adk_reads_the_config_where_the_plugin_expects_it():
    """Request-time compaction: the invocation's config (cleared by the plugin).
    Post-turn compaction: the App's (kept). An ADK upgrade that moves either read
    would either bring compaction back inside the turn or drop it silently."""
    assert "invocation_context.events_compaction_config" in inspect.getsource(CompactionRequestProcessor.run_async)
    assert "self.app.events_compaction_config" in inspect.getsource(Runner._run_post_invocation_compaction)


def test_a_late_compaction_never_hides_the_turns_after_it():
    """The post-turn compaction runs in the background: the next turn may append
    events before the summary lands. ADK places the summary at the end of its
    range by timestamp, so the newer events stay as they are."""
    def at(ts: float, text: str) -> Event:
        return Event(author="user", timestamp=ts, content=types.Content(role="user", parts=[types.Part(text=text)]))

    summary = types.Content(role="model", parts=[types.Part(text="RIASSUNTO")])
    late = Event(
        author="user", timestamp=10.0,
        actions=EventActions(compaction=EventCompaction(start_timestamp=1.0, end_timestamp=2.0, compacted_content=summary)),
    )
    events = [at(1.0, "turno 1"), at(2.0, "turno 2"), at(3.0, "turno 3, arrivato prima del riassunto"), late]

    visible = [e.content.parts[0].text for e in _process_compaction_events(events) if e.content and e.content.parts]
    assert visible == ["RIASSUNTO", "turno 3, arrivato prima del riassunto"]
