"""
Phase 138 PR-6: one login card per turn. In production (28 Oct) the router
called request_login twice and the quote agent once more, in the same turn:
three cards. The tool is idempotent within an invocation, and never asks a
signed-in user to log in.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from src.adk import tools


def _tool_context(invocation_id: str, state: dict) -> MagicMock:
    ctx = MagicMock()
    ctx.user_id = "uid-1"
    ctx.invocation_id = invocation_id
    ctx.state = state
    return ctx


@pytest.fixture(autouse=True)
def _production(monkeypatch: pytest.MonkeyPatch):
    from src.core.config import settings

    monkeypatch.setattr(settings, "ENV", "production")
    monkeypatch.setattr(settings, "ALLOW_AUTH_BYPASS", False)


async def _request_login(ctx: MagicMock, *, anonymous: bool = True) -> str:
    with patch.object(tools, "is_anonymous_user", new=AsyncMock(return_value=anonymous)):
        return await tools.request_login(tool_context=ctx)


async def test_second_call_in_the_same_turn_shows_no_second_card():
    state: dict = {}
    first = _tool_context("inv-1", state)
    second = _tool_context("inv-1", state)

    assert await _request_login(first) == "LOGIN_REQUIRED_TRIGGERED"
    reply = await _request_login(second)

    first.render_ui_widget.assert_called_once()
    second.render_ui_widget.assert_not_called()
    assert reply.startswith("LOGIN_GIA_RICHIESTO")


async def test_a_later_turn_asks_again():
    state: dict = {}
    await _request_login(_tool_context("inv-1", state))
    later = _tool_context("inv-2", state)

    assert await _request_login(later) == "LOGIN_REQUIRED_TRIGGERED"
    later.render_ui_widget.assert_called_once()


async def test_a_signed_in_user_is_never_asked_to_log_in():
    ctx = _tool_context("inv-1", {})

    reply = await _request_login(ctx, anonymous=False)

    ctx.render_ui_widget.assert_not_called()
    assert reply.startswith("UTENTE_GIA_AUTENTICATO")
