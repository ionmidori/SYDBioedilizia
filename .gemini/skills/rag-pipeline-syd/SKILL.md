---
name: rag-pipeline-syd
description: Professional RAG pipeline for SYD Bioedilizia — PDF ingestion with Gemini Structured Output (page-by-page multimodal extraction), Pinecone Integrated Inference (multilingual-e5-large), optional BM25 hybrid search upgrade, RAG evaluation with Ragas+Gemini. Use when improving chunk quality, adding hybrid search, re-ingesting Prezzario PDFs, or evaluating retrieval quality.
---

# RAG Pipeline — SYD Bioedilizia

Stack: FastAPI + Google ADK/Vertex AI + Pinecone (`syd-knowledge`, namespaces `prezzario` + `normative`).
Existing service: `backend_python/src/services/rag_service.py`.

## Pipeline Overview

```
PDF → Gemini 2.5 Flash (page-by-page structured extraction)
    → JSON articles → Pinecone Integrated Inference upsert
    → Semantic retrieval → Gemini answer → Ragas eval
```

**Alternative (hybrid upgrade)**: See [INGESTION.md](INGESTION.md) for Docling + BM25 approach.

## 1. PDF Ingestion (Current: Gemini Multimodal)

**Existing scripts** (already implemented):
- `backend_python/scripts/extract_prezzario.py` — Gemini 2.5 Flash page-by-page extraction → `data/prezzario_lazio_2023_structured.json`
- `backend_python/scripts/ingest_prezzario.py` — JSON → Pinecone `prezzario` namespace via `RAGService.upsert_documents()`

```bash
# Run extraction (requires GEMINI_API_KEY, ~4.5s/page for rate limiting)
cd backend_python
uv run python scripts/extract_prezzario.py --file data/tariffa_lazio_2023.pdf

# Ingest to Pinecone
uv run python scripts/ingest_prezzario.py --wipe
```

Key rules:
- Gemini extracts `codice`, `descrizione`, `unita_misura`, `prezzo_euro`, `categoria` per article
- Sub-items (a., b., c.) are extracted as separate records
- `RAGService` uses Pinecone Integrated Inference: embeddings handled server-side
- Deterministic IDs from `codice` → idempotent re-ingestion

## 2. Semantic Chunking (Chonkie)

```python
from chonkie import SemanticChunker
chunker = SemanticChunker(
    embedding_model="minishlab/potion-base-8M",  # lightweight, no external API
    chunk_size=400,
    threshold=0.5,
)
chunks = chunker.chunk(text)
```

Rules:
- Use `SemanticChunker` for narrative sections (intro, norme generali)
- Use fixed-size chunking for table rows (already structured)
- Target: 300-500 tokens per chunk, 50-token overlap

## 3. Hybrid Search Setup

See [HYBRID_SEARCH.md](HYBRID_SEARCH.md) for index migration.

```python
from pinecone_text.sparse import BM25Encoder
bm25 = BM25Encoder.default()
bm25.fit(corpus_texts)  # fit on entire Prezzario corpus

sparse_vector = bm25.encode_documents(chunk_text)
dense_vector = embed(chunk_text)  # multilingual-e5-large via Pinecone Inference

# Upsert with both vectors
index.upsert(vectors=[{
    "id": chunk_id,
    "values": dense_vector,
    "sparse_values": sparse_vector,
    "metadata": {...}
}])
```

Query with alpha blending:
```python
# alpha=0.0 → pure BM25, alpha=1.0 → pure dense
results = index.query(
    vector=dense_query,
    sparse_vector=bm25.encode_queries(query_text),
    alpha=0.75,  # 75% semantic, 25% keyword
    top_k=8,
)
```

**CRITICAL**: Hybrid search requires Pinecone index with `metric="dotproduct"`. Current index uses `cosine` — create new index or migrate. See [HYBRID_SEARCH.md](HYBRID_SEARCH.md).

## 4. Evaluation (Ragas)

See [EVALUATION.md](EVALUATION.md) for full eval suite.

```python
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision
from langchain_google_vertexai import ChatVertexAI

llm = ChatVertexAI(model_name="gemini-2.5-flash", project="chatbotluca-a8a73")
score = evaluate(dataset, metrics=[faithfulness, answer_relevancy, context_precision], llm=llm)
```

Target scores: faithfulness > 0.85, context_precision > 0.75.

## Metadata Schema (Pinecone — `prezzario` namespace)

```python
{
    "chunk_text": "Codice articolo: A 3.02.14.a. Categoria: Demolizioni. ...",  # embedded field
    "codice": "A 3.02.14.a.",
    "categoria": "Demolizioni e Rimozioni",
    "unita_misura": "mc",
    "prezzo_euro": 45.20,
    "source": "Tariffa Regionale Lazio 2023 - Opere Edili",
}
```

## Current State

- Index: `syd-knowledge` (Integrated Inference, cosine, multilingual-e5-large)
- Namespace `normative`: 548 chunks (flat text — old ingestion)
- Namespace `prezzario`: populated by running `extract_prezzario.py` + `ingest_prezzario.py`
- No BM25 sparse vectors (pure semantic search via Integrated Inference)

## Re-Ingestion Checklist (Current Pipeline)

1. `uv run python scripts/extract_prezzario.py --file data/tariffa_lazio_2023.pdf`
2. `uv run python scripts/ingest_prezzario.py --wipe`
3. `uv run python scripts/eval_rag.py --save tests/evals/results/eval_current.json`
4. If scores pass thresholds (faithfulness >0.80, context_precision >0.70) → production ready

## Hybrid Search Upgrade (Optional — syd-knowledge-v2)

See [HYBRID_SEARCH.md](HYBRID_SEARCH.md) and [INGESTION.md](INGESTION.md) for the Docling + BM25 approach.
Requires: `uv add docling chonkie pinecone-text` + new Pinecone index with `metric="dotproduct"`.
