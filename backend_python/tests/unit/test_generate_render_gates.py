"""
H3 (security audit 2026-10-03): generate_render must enforce the guest block
and the render quota server-side — the AUTH_GATE in the prompt is not a control.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from src.adk import tools
from src.auth import user_lookup

_RESET = datetime(2026, 10, 4, 9, 30, tzinfo=UTC)


@pytest.fixture()
def tool_context() -> MagicMock:
    ctx = MagicMock()
    ctx.session.id = "sess-1"
    ctx.user_id = "uid-1"
    ctx.save_artifact = AsyncMock(return_value=1)
    return ctx


@pytest.fixture(autouse=True)
def _production(monkeypatch: pytest.MonkeyPatch):
    from src.core.config import settings

    monkeypatch.setattr(settings, "ENV", "production")
    monkeypatch.setattr(settings, "ALLOW_AUTH_BYPASS", False)


async def _render(tool_context, *, anonymous: bool, allowed: bool, result: dict | None = None):
    wrapper = AsyncMock(return_value=result or {"status": "success", "imageUrl": "https://x/render.png"})
    increment = AsyncMock()
    with patch("src.tools.generate_render.generate_render_wrapper", new=wrapper), \
         patch.object(tools, "is_anonymous_user", new=AsyncMock(return_value=anonymous)), \
         patch.object(tools, "check_quota", new=AsyncMock(return_value=(allowed, 0, _RESET))), \
         patch.object(tools, "increment_quota", new=increment):
        out = await tools.generate_render(prompt="bagno", session_id="sess-1", tool_context=tool_context)
    return out, wrapper, increment


@pytest.mark.asyncio
async def test_anonymous_user_is_blocked_before_generation(tool_context):
    out, wrapper, increment = await _render(tool_context, anonymous=True, allowed=True)
    assert out["status"] == "error"
    assert "LOGIN_REQUIRED" in out["error"]
    wrapper.assert_not_awaited()
    increment.assert_not_awaited()


@pytest.mark.asyncio
async def test_exhausted_quota_blocks_generation(tool_context):
    out, wrapper, increment = await _render(tool_context, anonymous=False, allowed=False)
    assert out["status"] == "error"
    assert "09:30" in out["error"]
    wrapper.assert_not_awaited()
    increment.assert_not_awaited()


@pytest.mark.asyncio
async def test_successful_render_consumes_quota(tool_context):
    out, wrapper, increment = await _render(tool_context, anonymous=False, allowed=True)
    assert out["status"] == "success"
    wrapper.assert_awaited_once()
    increment.assert_awaited_once_with("uid-1", "generate_render")


@pytest.mark.asyncio
async def test_failed_render_does_not_consume_quota(tool_context):
    _, _, increment = await _render(tool_context, anonymous=False, allowed=True, result={"status": "error"})
    increment.assert_not_awaited()


# ─── is_anonymous_user ────────────────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("provider_data", "expected"),
    [([], True), ([MagicMock(provider_id="google.com")], False)],
)
async def test_is_anonymous_user_reads_linked_providers(provider_data, expected):
    user = MagicMock(provider_data=provider_data)
    with patch.object(user_lookup, "init_firebase"), \
         patch.object(user_lookup.auth, "get_user", return_value=user):
        assert await user_lookup.is_anonymous_user("uid-1") is expected


@pytest.mark.asyncio
async def test_is_anonymous_user_fails_closed_on_lookup_error():
    with patch.object(user_lookup, "init_firebase"), \
         patch.object(user_lookup.auth, "get_user", side_effect=RuntimeError("network")):
        assert await user_lookup.is_anonymous_user("uid-1") is True
