"""src.api.perplexity.fetch_market_prices — Perplexity Sonar client.

Replaces ``tests_manual/test_perplexity.py`` (a live call printing to stdout)
with deterministic checks against a mocked httpx client.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from src.api import perplexity
from src.api.perplexity import PERPLEXITY_API_URL, fetch_market_prices


def _client_returning(response: MagicMock) -> MagicMock:
    client = MagicMock()
    client.post = AsyncMock(return_value=response)
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    return client


def _json_response(payload: dict) -> MagicMock:
    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json = MagicMock(return_value=payload)
    return response


@pytest.fixture
def api_key(monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setattr(perplexity, "PERPLEXITY_API_KEY", "pplx-test")
    return "pplx-test"


async def test_returns_content_and_citations(api_key: str) -> None:
    payload = {
        "choices": [{"message": {"content": "Gres: 25-60 €/mq"}}],
        "citations": ["https://a.example"],
    }
    client = _client_returning(_json_response(payload))

    with patch.object(perplexity.httpx, "AsyncClient", return_value=client):
        result = await fetch_market_prices("costo gres")

    assert result == {
        "success": True,
        "content": "Gres: 25-60 €/mq",
        "citations": ["https://a.example"],
        "query": "costo gres",
    }
    url = client.post.call_args.args[0]
    kwargs = client.post.call_args.kwargs
    assert url == PERPLEXITY_API_URL
    assert kwargs["headers"]["Authorization"] == f"Bearer {api_key}"
    assert kwargs["json"]["messages"][-1] == {"role": "user", "content": "costo gres"}


async def test_missing_choices_yields_empty_content(api_key: str) -> None:
    client = _client_returning(_json_response({}))
    with patch.object(perplexity.httpx, "AsyncClient", return_value=client):
        result = await fetch_market_prices("q")

    assert result["content"] == ""
    assert result["citations"] == []


async def test_missing_api_key_fails_fast(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(perplexity, "PERPLEXITY_API_KEY", None)
    with patch.object(perplexity.httpx, "AsyncClient") as client_cls:
        with pytest.raises(Exception, match="PERPLEXITY_API_KEY not configured"):
            await fetch_market_prices("q")
    client_cls.assert_not_called()


async def test_http_error_reports_status_only(api_key: str) -> None:
    error_response = MagicMock(status_code=429, text="rate limited: key pplx-test")
    response = MagicMock()
    response.raise_for_status = MagicMock(
        side_effect=httpx.HTTPStatusError("429", request=MagicMock(), response=error_response)
    )
    client = _client_returning(response)

    with patch.object(perplexity.httpx, "AsyncClient", return_value=client):
        with pytest.raises(Exception, match="API request failed: 429") as exc:
            await fetch_market_prices("q")
    assert "pplx-test" not in str(exc.value)


async def test_unexpected_error_is_generic(api_key: str) -> None:
    client = MagicMock()
    client.__aenter__ = AsyncMock(side_effect=RuntimeError("socket: secret detail"))
    client.__aexit__ = AsyncMock(return_value=False)

    with patch.object(perplexity.httpx, "AsyncClient", return_value=client):
        with pytest.raises(Exception, match="Market price lookup failed") as exc:
            await fetch_market_prices("q")
    assert "secret detail" not in str(exc.value)
