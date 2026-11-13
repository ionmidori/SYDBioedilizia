"""
ADK history compaction for SYD chats (Phase 138 PR-5).

Past `ADK_COMPACTION_TOKEN_THRESHOLD` prompt tokens, ADK replaces the older
events of the session with one summary (the newest
`ADK_COMPACTION_EVENT_RETENTION` events stay as they are). The summary is
organized room by room (src/prompts/components/compaction.py) and written by the
summarizer model (`ModelRole.SUMMARIZER`).

Compaction runs only after a turn, never inside one:
- ADK also compacts before every model call once the last prompt reached the
  threshold (request processor `_compaction`), synchronously and in the middle
  of a turn: the summarizer would delay the first token, and the summary could
  swallow the current user message (an eval saw "registra la richiesta" become
  a sent quote). `PostTurnCompactionPlugin` clears the invocation's compaction
  config before the turn and restores it in `after_run_callback` (right before
  ADK's post-invocation compaction runs).
- After the turn, `SydRunner` (app_factory.py) runs it in the background, once
  the reply has been streamed. It must never turn an answered turn into an
  error: a model error or a timeout leaves the history uncompacted (ADK
  retries after a later turn).
"""
import asyncio
import logging
import time

import httpx
from google.adk.agents.invocation_context import InvocationContext
from google.adk.apps.app import EventsCompactionConfig
from google.adk.apps.llm_event_summarizer import LlmEventSummarizer
from google.adk.events import Event
from google.adk.plugins.base_plugin import BasePlugin
from google.api_core.exceptions import GoogleAPIError
from google.genai import errors as genai_errors

from src.adk.model_factory import build_adk_model
from src.core.config import settings
from src.core.models import ModelRole
from src.prompts.components.compaction import COMPACTION_PROMPT_TEMPLATE

logger = logging.getLogger(__name__)


class RoomAwareEventSummarizer(LlmEventSummarizer):
    """`LlmEventSummarizer` with the room-by-room template, a deadline and no
    error propagation (None = no compaction this time)."""

    def __init__(self, timeout_seconds: float) -> None:
        super().__init__(llm=build_adk_model(ModelRole.SUMMARIZER), prompt_template=COMPACTION_PROMPT_TEMPLATE)
        self._timeout_seconds = timeout_seconds

    async def maybe_summarize_events(self, *, events: list[Event]) -> Event | None:
        started = time.perf_counter()
        outcome = "ok"
        summary_chars = 0
        try:
            async with asyncio.timeout(self._timeout_seconds):
                event = await super().maybe_summarize_events(events=events)
        except TimeoutError:
            outcome, event = "timeout", None
        except (genai_errors.APIError, GoogleAPIError, httpx.HTTPError) as exc:
            outcome, event = f"error:{type(exc).__name__}", None
        else:
            compaction = event.actions.compaction if event is not None else None
            content = compaction.compacted_content if compaction is not None else None
            summary_chars = sum(len(p.text or "") for p in (content.parts or [])) if content else 0
            if not summary_chars:
                outcome, event = "empty", None
        log = logger.info if outcome == "ok" else logger.warning
        log(
            "[ADK] History compaction",
            extra={
                "event": "adk_compaction",
                "outcome": outcome,
                "events": len(events),
                "summary_chars": summary_chars,
                "duration_ms": round((time.perf_counter() - started) * 1000),
            },
        )
        return event


class PostTurnCompactionPlugin(BasePlugin):
    """Keeps history compaction out of the turn without disabling post-turn compaction.

    Since ADK 2.14, both request-time (`CompactionRequestProcessor`) and
    post-turn (`Runner._run_post_invocation_compaction`) compaction read
    `invocation_context.events_compaction_config`, and `_run_invocation_lifecycle`
    executes `after_run_callback` before `post_run_compaction`. Clearing the
    config in `before_run_callback` and restoring it by `invocation_id` in
    `after_run_callback` disables only the mid-turn path while keeping post-turn
    compaction active across concurrent sessions and custom App overrides.
    `tests/unit/test_compaction.py` fails if ADK changes that lifecycle order.
    """

    _MAX_TRACKED_INVOCATIONS = 1024

    def __init__(self) -> None:
        super().__init__(name="syd_post_turn_compaction")
        self._saved_configs: dict[str, EventsCompactionConfig] = {}

    async def before_run_callback(self, *, invocation_context: InvocationContext) -> None:
        config = invocation_context.events_compaction_config
        if config is not None:
            if len(self._saved_configs) >= self._MAX_TRACKED_INVOCATIONS:
                self._saved_configs.pop(next(iter(self._saved_configs)))
            self._saved_configs[invocation_context.invocation_id] = config
            invocation_context.events_compaction_config = None
        return None

    async def after_run_callback(self, *, invocation_context: InvocationContext) -> None:
        saved = self._saved_configs.pop(invocation_context.invocation_id, None)
        if saved is not None and invocation_context.events_compaction_config is None:
            invocation_context.events_compaction_config = saved
        return None

    async def on_run_error_callback(self, *, invocation_context: InvocationContext, error: Exception) -> None:
        del error
        self._saved_configs.pop(invocation_context.invocation_id, None)
        return None


def build_events_compaction_config(
    token_threshold: int | None = None, event_retention_size: int | None = None
) -> EventsCompactionConfig:
    """Token-threshold compaction from settings (the arguments override them, for evals)."""
    return EventsCompactionConfig(
        token_threshold=token_threshold or settings.ADK_COMPACTION_TOKEN_THRESHOLD,
        event_retention_size=(
            event_retention_size if event_retention_size is not None else settings.ADK_COMPACTION_EVENT_RETENTION
        ),
        summarizer=RoomAwareEventSummarizer(timeout_seconds=settings.ADK_SUMMARIZER_TIMEOUT_SECONDS),
    )
