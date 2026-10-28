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
  a sent quote). `PostTurnCompactionPlugin` turns that path off for each run;
  the post-turn compaction reads the App's config and is unaffected.
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
    """Keeps the history compaction out of the turn.

    The request-time compaction reads `invocation_context.events_compaction_config`
    (and nothing else does); the post-turn one reads the App's. Clearing the
    former at the start of each run leaves only the post-turn compaction.
    tests/unit/test_compaction.py fails if ADK changes where either reads it.
    """

    def __init__(self) -> None:
        super().__init__(name="syd_post_turn_compaction")

    async def before_run_callback(self, *, invocation_context: InvocationContext) -> None:
        invocation_context.events_compaction_config = None
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
