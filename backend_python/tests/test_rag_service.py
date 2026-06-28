"""
Tests for RAGService.search (src/services/rag_service.py).

Focus: the result parsing (SDK to_dict emits score_/id_), min_score
filtering, and rerank request shaping (over-fetch + rerank payload).
"""
import pytest
from unittest.mock import MagicMock, patch

from src.services.rag_service import RAGService
from src.core import config


class _FakeResp:
    """Mimics the Pinecone search response object with .to_dict()."""
    def __init__(self, hits):
        self._hits = hits

    def to_dict(self):
        return {"result": {"hits": self._hits}}


def _hit(codice, score, text="Codice articolo: X. Demolizione."):
    # SDK to_dict() uses the trailing-underscore keys.
    return {"id_": f"id-{codice}", "score_": score, "fields": {"codice": codice, "chunk_text": text}}


def _service_with_hits(hits):
    """RAGService bypassing __init__ (no live Pinecone), index.search → hits."""
    svc = RAGService.__new__(RAGService)
    svc.pc = object()
    svc.index = MagicMock()
    svc.index.search.return_value = _FakeResp(hits)
    return svc


@pytest.mark.asyncio
async def test_search_parses_score_and_id_underscore_keys():
    """Regression: previously score was read as 'score' (always 0.0)."""
    svc = _service_with_hits([_hit("A 1.", 0.91), _hit("A 2.", 0.80)])
    with patch.object(config.settings, "RAG_RERANK_ENABLED", False), \
         patch.object(config.settings, "RAG_MIN_SCORE", 0.0):
        res = await svc.search("demolizione", top_k=2)
    assert [r["score"] for r in res] == [0.91, 0.80]
    assert res[0]["id"] == "id-A 1."
    assert res[0]["metadata"]["codice"] == "A 1."


@pytest.mark.asyncio
async def test_search_min_score_filters_low_hits():
    svc = _service_with_hits([_hit("A 1.", 0.91), _hit("A 2.", 0.40)])
    with patch.object(config.settings, "RAG_RERANK_ENABLED", False):
        res = await svc.search("demolizione", top_k=5, min_score=0.5)
    assert [r["metadata"]["codice"] for r in res] == ["A 1."]


@pytest.mark.asyncio
async def test_search_rerank_overfetches_and_sends_rerank_payload():
    svc = _service_with_hits([_hit("A 1.", 0.99)])
    with patch.object(config.settings, "RAG_RERANK_ENABLED", True), \
         patch.object(config.settings, "RAG_RERANK_OVERFETCH", 4), \
         patch.object(config.settings, "RAG_RERANK_MODEL", "bge-reranker-v2-m3"), \
         patch.object(config.settings, "RAG_MIN_SCORE", 0.0):
        await svc.search("demolizione", top_k=5)

    _, kwargs = svc.index.search.call_args
    # Over-fetch: query top_k must be 5 × 4 = 20
    assert kwargs["query"].top_k == 20
    assert kwargs["rerank"] == {
        "model": "bge-reranker-v2-m3",
        "rank_fields": ["chunk_text"],
        "top_n": 5,
    }


@pytest.mark.asyncio
async def test_search_no_rerank_fetches_exact_top_k_and_omits_rerank():
    svc = _service_with_hits([_hit("A 1.", 0.9)])
    with patch.object(config.settings, "RAG_RERANK_ENABLED", True), \
         patch.object(config.settings, "RAG_MIN_SCORE", 0.0):
        await svc.search("demolizione", top_k=3, rerank=False)

    _, kwargs = svc.index.search.call_args
    assert kwargs["query"].top_k == 3
    assert "rerank" not in kwargs


@pytest.mark.asyncio
async def test_search_returns_empty_when_index_missing():
    svc = RAGService.__new__(RAGService)
    svc.pc = None
    svc.index = None
    assert await svc.search("x") == []
