"""
Phase 138 PR-6: a guest is asked to log in once, in the turn in which it
confirms a render or a quote, and never before. The prompt decides the moment,
the server decides the access:
- only the agents that ask for the confirmation (design, quote) can show the
  login card — not the router, which asked first in production (28 Oct);
- renders and quotes refuse a guest server side; prices do not need an account
  (user decision, 29 Oct: listino, prezzario RAG, price book and market prices
  are open to guests — a price question is not a confirmation).
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


def test_only_the_agents_that_confirm_can_ask_for_the_login():
    assert "request_login" not in _tool_names(agents.syd_orchestrator)
    assert "request_login" in _tool_names(agents.design_agent)
    assert "request_login" in _tool_names(agents.quote_agent)
    assert "request_login" not in _tool_names(agents.triage_agent)


# (tool, kwargs, what the tool calls)
_PRICED_TOOLS = [
    ("search_prezzario", {"query": "parquet"}, "src.tools.rag_tools.search_prezzario"),
    ("retrieve_price_by_code", {"codice_articolo": "A 3.01.15.f."}, "src.tools.rag_tools.retrieve_price_by_code"),
    ("get_market_prices", {"query": "piastrelle"}, "src.tools.market_prices.get_market_prices_wrapper"),
    ("search_listino", {"query": "finestra PVC"}, "src.tools.listino_tools.search_listino"),
]


@pytest.mark.parametrize(("name", "kwargs", "inner"), _PRICED_TOOLS, ids=[t[0] for t in _PRICED_TOOLS])
async def test_a_guest_gets_prices_without_any_account_lookup(name, kwargs, inner):
    """Production, 29 Oct: a guest asked for a price, the prezzario refused it and
    the agent answered without data. Prices are open: no lookup, no refusal."""
    wrapped = AsyncMock(return_value="ok")
    lookup = AsyncMock(return_value=True)
    with patch(inner, new=wrapped), patch.object(tools, "is_anonymous_user", new=lookup):
        out = await getattr(tools, name)(**kwargs)

    assert out == "ok"
    wrapped.assert_awaited_once()
    lookup.assert_not_awaited()


async def test_the_price_book_prices_a_line_for_a_guest(monkeypatch: pytest.MonkeyPatch):
    from src.services.pricing_service import PricingService

    monkeypatch.setattr(PricingService, "ensure_fresh", AsyncMock())
    monkeypatch.setattr(
        PricingService, "get_item_by_sku",
        classmethod(lambda cls, sku: {"sku": sku, "description": "Posa", "unit": "mq", "unit_price": 30.0}),
    )
    lookup = AsyncMock(return_value=True)
    with patch.object(tools, "is_anonymous_user", new=lookup):
        out = await tools.pricing_engine_tool("PAV-001", 2)

    assert out["status"] == "success" and out["total"] == 60.0
    lookup.assert_not_awaited()


def test_guest_rule_gates_renders_and_quotes_only_and_keeps_the_order():
    block = session_context_instruction(
        MagicMock(state=session_context_delta(is_guest=True, phone_on_file=False, session_id="p"))
    )
    for name in ("generate_render", "suggest_quote_items", "submit_quote_request"):
        assert name in block
    for name in ("search_prezzario", "retrieve_price_by_code", "pricing_engine", "market_prices", "search_listino"):
        assert name in block.split("Liberi per tutti")[1].split("\n")[0], name
    # 1) confirmation, 2) login and stop, 3) the tool after the login.
    assert block.index("CONFERMA") < block.index("request_login_adk") < block.index("DOPO IL LOGIN")


async def test_the_account_is_looked_up_once_per_turn():
    """Several gated calls in one turn: one Firebase lookup."""
    state: dict = {}
    lookup = AsyncMock(return_value=False)

    def ctx(invocation_id: str) -> MagicMock:
        c = MagicMock(user_id="uid-1", invocation_id=invocation_id)
        c.session.id = "sess-1"
        c.state = state
        return c

    with patch("src.tools.quote_tools.suggest_quote_items_wrapper", new=AsyncMock(return_value="ok")), \
         patch.object(tools, "is_anonymous_user", new=lookup):
        for _ in range(3):
            await tools.suggest_quote_items(session_id="sess-1", tool_context=ctx("inv-1"))
        assert lookup.await_count == 1
        await tools.suggest_quote_items(session_id="sess-1", tool_context=ctx("inv-2"))
    assert lookup.await_count == 2
