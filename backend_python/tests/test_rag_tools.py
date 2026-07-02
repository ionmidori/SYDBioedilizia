"""
Tests for RAG tool wrappers (src/tools/rag_tools.py).

Focus: retrieve_price_by_code must resolve an article code via an exact
metadata filter (deterministic) rather than relying on semantic ranking,
which could return a wrong-but-similar article.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from src.tools import rag_tools
from src.tools.rag_tools import _codice_variants, retrieve_price_by_code


def _make_rag_service(search_side_effect):
    """Build a mock RAGService with pc truthy and an async search()."""
    svc = MagicMock()
    svc.pc = object()  # truthy → passes the "configured" guard
    svc.search = AsyncMock(side_effect=search_side_effect)
    return svc


def _prezzario_hit(codice: str, prezzo: float = 25.62):
    return {
        "id": "abc",
        "score": 0.99,
        "metadata": {
            "codice": codice,
            "chunk_text": f"Codice articolo: {codice}. Demolizione pavimento.",
            "prezzo_euro": prezzo,
            "unita_misura": "mq",
            "categoria": "Demolizioni e Rimozioni",
        },
    }


def test_codice_variants_adds_trailing_dot():
    assert _codice_variants("A 3.01.15.f") == ["A 3.01.15.f", "A 3.01.15.f."]


def test_codice_variants_strips_trailing_dot():
    assert _codice_variants("A 3.01.15.f.") == ["A 3.01.15.f.", "A 3.01.15.f"]

@pytest.mark.asyncio
async def test_exact_lookup_uses_codice_filter():
    """The first search must filter on the `codice` metadata field via $in."""
    svc = _make_rag_service([[_prezzario_hit("A 3.01.15.f.")]])
    with patch.object(rag_tools, "get_rag_service", return_value=svc):
        out = await retrieve_price_by_code("A 3.01.15.f.")

    # First call carries the exact-match filter on codice
    _, kwargs = svc.search.call_args_list[0]
    assert kwargs["filter_dict"] == {"codice": {"$in": ["A 3.01.15.f.", "A 3.01.15.f"]}} or \
        kwargs["filter_dict"]["codice"]["$in"] == ["A 3.01.15.f", "A 3.01.15.f."]
    assert kwargs["namespace"] == "prezzario"
    assert "A 3.01.15.f." in out
    assert "€25.62/mq" in out
    assert "approssimativa" not in out  # exact → no approximate warning


@pytest.mark.asyncio
async def test_exact_lookup_matches_without_trailing_dot():
    """User omits the trailing dot; the $in variant still resolves it exactly."""
    svc = _make_rag_service([[_prezzario_hit("A 3.01.15.f.")]])
    with patch.object(rag_tools, "get_rag_service", return_value=svc):
        out = await retrieve_price_by_code("A 3.01.15.f")
    assert "approssimativa" not in out
    assert svc.search.call_count == 1  # no semantic fallback needed


@pytest.mark.asyncio
async def test_falls_back_to_semantic_when_no_exact_match():
    """No exact filter hit → semantic fallback, flagged as approximate."""
    svc = _make_rag_service([
        [],                                  # exact filter: nothing
        [_prezzario_hit("A 3.01.15.h.")],    # semantic fallback: closest
    ])
    with patch.object(rag_tools, "get_rag_service", return_value=svc):
        out = await retrieve_price_by_code("A 9.99.99.z.")

    assert svc.search.call_count == 2
    # Second (fallback) call must NOT carry a codice filter
    _, fb_kwargs = svc.search.call_args_list[1]
    assert fb_kwargs.get("filter_dict") is None
    assert "approssimativa" in out


@pytest.mark.asyncio
async def test_not_found_when_both_searches_empty():
    svc = _make_rag_service([[], []])
    with patch.object(rag_tools, "get_rag_service", return_value=svc):
        out = await retrieve_price_by_code("A 9.99.99.z.")
    assert "non trovato" in out


@pytest.mark.asyncio
async def test_returns_unavailable_when_pinecone_down():
    svc = MagicMock()
    svc.pc = None
    with patch.object(rag_tools, "get_rag_service", return_value=svc):
        out = await retrieve_price_by_code("A 3.01.15.f.")
    assert "non è" in out and "raggiungibile" in out
