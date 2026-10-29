"""
Phase 138 PR-6: a guest is asked to log in once, in the turn in which it
confirms a render or a quote, and never before. The prompt decides the moment,
the server decides the access:
- only the agents that ask for the confirmation (design, quote) can show the
  login card — not the router, which asked first in production (28 Oct);
- every priced tool but the customer listino refuses a guest server side,
  without asking it to log in (a price question is not a confirmation).
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from src.adk import agents, tools
from src.adk.session_context import session_context_delta, session_context_instruction


def _tool_names(agent) -> set[str]:
    return {getattr(t, "name", None) or getattr(t, "__name__", "") for t in agent.tools}


@pytest.fixture(autouse=True)
def _production(monkeypatch: pytest.MonkeyPatch):
    from src.core.config import settings

    monkeypatch.setattr(settings, "ENV", "production")
    monkeypatch.setattr(settings, "ALLOW_AUTH_BYPASS", False)


@pytest.fixture()
def tool_context() -> MagicMock:
    ctx = MagicMock()
    ctx.user_id = "uid-1"
    return ctx


def test_only_the_agents_that_confirm_can_ask_for_the_login():
    assert "request_login" not in _tool_names(agents.syd_orchestrator)
    assert "request_login" in _tool_names(agents.design_agent)
    assert "request_login" in _tool_names(agents.quote_agent)
    assert "request_login" not in _tool_names(agents.triage_agent)


# (tool, kwargs, what the tool would have called)
_PRICED_TOOLS = [
    ("pricing_engine_tool", {"sku": "POS-001", "qty": 2}, "src.services.pricing_service.PricingService.ensure_fresh"),
    ("search_prezzario", {"query": "parquet"}, "src.tools.rag_tools.search_prezzario"),
    ("retrieve_price_by_code", {"codice_articolo": "A 3.01.15.f."}, "src.tools.rag_tools.retrieve_price_by_code"),
    ("get_market_prices", {"query": "piastrelle"}, "src.tools.market_prices.get_market_prices_wrapper"),
]


@pytest.mark.parametrize(("name", "kwargs", "inner"), _PRICED_TOOLS, ids=[t[0] for t in _PRICED_TOOLS])
async def test_priced_tools_refuse_a_guest_without_asking_it_to_log_in(tool_context, name, kwargs, inner):
    wrapped = AsyncMock(return_value="ok")
    with patch(inner, new=wrapped), \
         patch.object(tools, "is_anonymous_user", new=AsyncMock(return_value=True)):
        out = await getattr(tools, name)(**kwargs, tool_context=tool_context)

    wrapped.assert_not_awaited()
    text = str(out)
    assert "RISERVATO_UTENTI_REGISTRATI" in text and "search_listino" in text
    assert "Chiama request_login_adk" not in text


@pytest.mark.parametrize(("name", "kwargs", "inner"), _PRICED_TOOLS[1:], ids=[t[0] for t in _PRICED_TOOLS[1:]])
async def test_priced_tools_run_for_a_registered_user(tool_context, name, kwargs, inner):
    wrapped = AsyncMock(return_value="ok")
    with patch(inner, new=wrapped), \
         patch.object(tools, "is_anonymous_user", new=AsyncMock(return_value=False)):
        out = await getattr(tools, name)(**kwargs, tool_context=tool_context)

    assert out == "ok"
    wrapped.assert_awaited_once()


def test_the_customer_listino_stays_open_to_guests():
    """PRICE INQUIRY for a guest: the listino range, no login (user decision, 29 Oct)."""
    assert "tool_context" not in tools.search_listino.__wrapped__.__code__.co_varnames


def test_guest_rule_names_every_server_gated_tool_and_the_order():
    block = session_context_instruction(
        MagicMock(state=session_context_delta(is_guest=True, phone_on_file=False, session_id="p"))
    )
    for name in ("generate_render", "suggest_quote_items", "submit_quote_request", "pricing_engine",
                 "search_prezzario", "retrieve_price_by_code", "market_prices"):
        assert name in block
    # 1) confirmation, 2) login and stop, 3) the tool after the login.
    assert block.index("CONFERMA") < block.index("request_login_adk") < block.index("DOPO IL LOGIN")


async def test_the_account_is_looked_up_once_per_turn():
    """Many priced calls in one turn (a quote prices every line): one Firebase lookup."""
    state: dict = {}
    lookup = AsyncMock(return_value=False)

    def ctx(invocation_id: str) -> MagicMock:
        c = MagicMock(user_id="uid-1", invocation_id=invocation_id)
        c.state = state
        return c

    with patch("src.tools.rag_tools.search_prezzario", new=AsyncMock(return_value="ok")), \
         patch.object(tools, "is_anonymous_user", new=lookup):
        for _ in range(3):
            await tools.search_prezzario(query="parquet", tool_context=ctx("inv-1"))
        assert lookup.await_count == 1
        await tools.search_prezzario(query="parquet", tool_context=ctx("inv-2"))
    assert lookup.await_count == 2
