"""get_market_prices_wrapper — the ``market_prices`` ADK tool (design + quote agents).

Its only coverage used to be TestSprite TC002, which hit it live through the
dev-only ``/api/test/tools/market-prices`` route. These tests pin the wrapper's
contract with the Perplexity client mocked: formatted citations (max 3), a
generic message on failure, and no exception text leaked to the agent.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

from src.tools import market_prices
from src.tools.market_prices import get_market_prices_wrapper

UNAVAILABLE = "Unable to fetch market prices at this time. Please try again later."


async def test_returns_content_with_at_most_three_sources() -> None:
    result = {
        "success": True,
        "content": "Gres porcellanato: 25-60 €/mq.",
        "citations": ["https://a.example", "https://b.example", "https://c.example", "https://d.example"],
    }
    with patch.object(market_prices, "fetch_market_prices", new=AsyncMock(return_value=result)) as fetch:
        text = await get_market_prices_wrapper("costo gres porcellanato Roma")

    fetch.assert_awaited_once_with("costo gres porcellanato Roma")
    assert text.startswith("Gres porcellanato: 25-60 €/mq.")
    assert "Sources:" in text
    assert "3. https://c.example" in text
    assert "https://d.example" not in text


async def test_without_citations_returns_bare_content() -> None:
    result = {"success": True, "content": "Pittura: 8-15 €/mq.", "citations": []}
    with patch.object(market_prices, "fetch_market_prices", new=AsyncMock(return_value=result)):
        text = await get_market_prices_wrapper("pittura")

    assert text == "Pittura: 8-15 €/mq."


async def test_unsuccessful_lookup_returns_generic_message() -> None:
    with patch.object(market_prices, "fetch_market_prices", new=AsyncMock(return_value={"success": False})):
        assert await get_market_prices_wrapper("q") == UNAVAILABLE


async def test_client_error_is_not_leaked() -> None:
    boom = RuntimeError("PERPLEXITY_API_KEY=sk-secret not configured")
    with patch.object(market_prices, "fetch_market_prices", new=AsyncMock(side_effect=boom)):
        text = await get_market_prices_wrapper("q")

    assert text == UNAVAILABLE
    assert "sk-secret" not in text
