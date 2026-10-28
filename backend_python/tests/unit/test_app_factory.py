"""
The App of SYD (Phase 138 PR-5): one build for production and evals, history
compaction off the reply, explicit context cache behind a flag.
"""
import asyncio
import inspect
from unittest.mock import patch

from google.adk.agents.context_cache_config import ContextCacheConfig
from google.adk.plugins.base_plugin import BasePlugin
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService, Session
from src.adk.app_factory import APP_NAME, SydRunner, build_app, build_context_cache_config
from src.adk.compaction import RoomAwareEventSummarizer, build_events_compaction_config
from src.core.config import settings


def test_plugins_in_production_order_then_the_extra_ones():
    extra = BasePlugin(name="eval_extra")
    app = build_app(extra_plugins=[extra])
    assert [p.name for p in app.plugins] == [
        "syd_post_turn_compaction", "syd_video_guard", "syd_media_model", "syd_latency", "eval_extra",
    ]
    assert app.name == APP_NAME


def test_compaction_from_settings(monkeypatch):
    monkeypatch.setattr(settings, "ADK_COMPACTION_TOKEN_THRESHOLD", 30000)
    monkeypatch.setattr(settings, "ADK_COMPACTION_EVENT_RETENTION", 12)
    config = build_app().events_compaction_config
    assert config is not None
    assert (config.token_threshold, config.event_retention_size) == (30000, 12)
    assert isinstance(config.summarizer, RoomAwareEventSummarizer)


def test_compaction_override_for_evals():
    app = build_app(compaction=build_events_compaction_config(token_threshold=8000, event_retention_size=4))
    assert app.events_compaction_config is not None
    assert app.events_compaction_config.token_threshold == 8000


def test_explicit_context_cache_is_off_by_default(monkeypatch):
    monkeypatch.setattr(settings, "ADK_CONTEXT_CACHE_ENABLED", False)
    assert build_context_cache_config() is None
    assert build_app().context_cache_config is None


def test_explicit_context_cache_from_settings(monkeypatch):
    monkeypatch.setattr(settings, "ADK_CONTEXT_CACHE_ENABLED", True)
    monkeypatch.setattr(settings, "ADK_CONTEXT_CACHE_MIN_TOKENS", 5000)
    monkeypatch.setattr(settings, "ADK_CONTEXT_CACHE_TTL_SECONDS", 600)
    monkeypatch.setattr(settings, "ADK_CONTEXT_CACHE_INTERVALS", 5)
    monkeypatch.setattr(settings, "ADK_CONTEXT_CACHE_CREATE_TIMEOUT_MS", 1500)
    config = build_context_cache_config()
    assert isinstance(config, ContextCacheConfig)
    assert (config.min_tokens, config.ttl_seconds, config.cache_intervals) == (5000, 600, 5)
    assert config.create_http_options is not None and config.create_http_options.timeout == 1500


def test_overridden_adk_method_keeps_its_signature():
    """SydRunner overrides a private ADK method: an ADK upgrade that renames it
    or changes its parameters would silently bring compaction back inline."""
    params = inspect.signature(Runner._run_post_invocation_compaction).parameters
    assert list(params) == ["self", "session"]
    assert params["session"].kind is inspect.Parameter.KEYWORD_ONLY
    assert "_run_post_invocation_compaction" in Runner.__dict__


async def test_compaction_runs_after_the_turn_without_holding_it():
    release = asyncio.Event()
    done = asyncio.Event()

    async def slow_compaction(self, *, session):
        await release.wait()
        done.set()

    runner = SydRunner(app=build_app(), session_service=InMemorySessionService())
    session = Session(id="s1", app_name=APP_NAME, user_id="u1")
    with patch.object(Runner, "_run_post_invocation_compaction", slow_compaction):
        # Returns at once: the summarizer has not even been released yet.
        await asyncio.wait_for(runner._run_post_invocation_compaction(session=session), timeout=1)
        assert not done.is_set()
        release.set()
        await asyncio.wait_for(done.wait(), timeout=1)
