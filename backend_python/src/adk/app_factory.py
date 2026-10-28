"""
The ADK App of SYD and its Runner, built in one place (Phase 138 PR-5).

Production (`ADKOrchestrator`) and the multi-room evals build the same App:
plugins in the production order, history compaction and, when enabled, the
explicit context cache. Settings drive every threshold (src/core/config.py).

`SydRunner` moves the post-turn history compaction off the reply: ADK awaits it
inside `run_async` after the last event, so the end of the stream, the saving of
the reply and the turn timeout would all wait for the summarizer model. ADK's
other compaction, before each model call, is turned off by
`PostTurnCompactionPlugin` (src/adk/compaction.py).
"""
from google.adk.agents.context_cache_config import ContextCacheConfig
from google.adk.apps.app import App, EventsCompactionConfig
from google.adk.plugins.base_plugin import BasePlugin
from google.adk.runners import Runner
from google.adk.sessions import Session
from google.genai import types

from src.adk.agents import syd_orchestrator
from src.adk.background import run_in_background
from src.adk.compaction import PostTurnCompactionPlugin, build_events_compaction_config
from src.adk.latency_plugin import LatencyPlugin
from src.adk.media_model_plugin import MediaModelPlugin
from src.adk.video_guard_plugin import VideoGuardPlugin
from src.core.config import settings

APP_NAME = "syd_orchestrator"


class SydRunner(Runner):
    """Runner whose post-turn compaction runs as a background task.

    A summary that lands after the next turn has appended events hides nothing
    newer: ADK places it at the end of the range it covers, by timestamp
    (tests/unit/test_compaction.py). Overrides a private ADK method:
    tests/unit/test_app_factory.py fails if its signature changes on an ADK
    upgrade.
    """

    async def _run_post_invocation_compaction(self, *, session: Session) -> None:
        run_in_background(super()._run_post_invocation_compaction(session=session), name="adk_compaction")


def build_context_cache_config() -> ContextCacheConfig | None:
    """Explicit Gemini context cache, or None when disabled (implicit caching only).

    Off by default (2026-10-28): on Vertex `eu` a cache took 0.9-117 s to create
    and ADK creates it before the model call, so every creation attempt delays
    the first token by up to `ADK_CONTEXT_CACHE_CREATE_TIMEOUT_MS`.
    """
    if not settings.ADK_CONTEXT_CACHE_ENABLED:
        return None
    return ContextCacheConfig(
        min_tokens=settings.ADK_CONTEXT_CACHE_MIN_TOKENS,
        ttl_seconds=settings.ADK_CONTEXT_CACHE_TTL_SECONDS,
        cache_intervals=settings.ADK_CONTEXT_CACHE_INTERVALS,
        create_http_options=types.HttpOptions(timeout=settings.ADK_CONTEXT_CACHE_CREATE_TIMEOUT_MS),
    )


def build_app(
    *,
    extra_plugins: list[BasePlugin] | None = None,
    compaction: EventsCompactionConfig | None = None,
) -> App:
    """SYD's App. `extra_plugins` (evals: response recorder) run after the
    production ones; `compaction` replaces the settings-driven config (evals:
    a lower threshold, so a test chat reaches it)."""
    return App(
        name=APP_NAME,
        root_agent=syd_orchestrator,
        # PostTurnCompactionPlugin: compaction only after the turn (compaction.py).
        # VideoGuardPlugin before MediaModelPlugin: the latter then sees only the
        # media really sent; LatencyPlugin last logs the model actually used.
        plugins=[
            PostTurnCompactionPlugin(),
            VideoGuardPlugin(),
            MediaModelPlugin(),
            LatencyPlugin(),
            *(extra_plugins or []),
        ],
        events_compaction_config=compaction or build_events_compaction_config(),
        context_cache_config=build_context_cache_config(),
    )
