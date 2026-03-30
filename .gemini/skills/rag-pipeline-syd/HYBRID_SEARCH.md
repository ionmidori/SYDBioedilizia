# Hybrid Search — BM25 + Dense (Pinecone)

## Why Hybrid for Prezzario

- **Article codes** (`01.01.001`) require exact keyword match → BM25
- **Semantics** (`lavori di demolizione`) require dense vector → multilingual-e5-large
- Hybrid captures both: "Quanto costa demolire un muro portante?" hits both keyword (`demolire`, `muro`) and semantics

## Index Migration

Current `syd-knowledge` uses `cosine` metric → **incompatible with BM25 sparse vectors**.
New index `syd-knowledge-v2` must use `dotproduct`.

```python
from pinecone import Pinecone, ServerlessSpec

pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])
pc.create_index(
    name="syd-knowledge-v2",
    dimension=1024,
    metric="dotproduct",          # REQUIRED for hybrid
    spec=ServerlessSpec(cloud="aws", region="us-east-1"),
)
```

## rag_service.py — Hybrid Query

Update `retrieve_knowledge()` in `backend_python/src/services/rag_service.py`:

```python
from pinecone_text.sparse import BM25Encoder

# Load pre-fitted BM25 (fitted during ingestion, saved to JSON)
_bm25: BM25Encoder | None = None

def _get_bm25() -> BM25Encoder:
    global _bm25
    if _bm25 is None:
        _bm25 = BM25Encoder.load("data/bm25_prezzario.json")
    return _bm25


async def retrieve_knowledge(query: str, top_k: int = 8, alpha: float = 0.75) -> list[dict]:
    """
    Hybrid retrieval: alpha=1.0 → pure dense, alpha=0.0 → pure BM25.
    Default alpha=0.75 (mostly semantic, keyword boost).
    For article code lookups use alpha=0.3 (more keyword weight).
    """
    from starlette.concurrency import run_in_threadpool

    index = _get_index()  # existing helper
    bm25 = _get_bm25()

    # Dense embedding via Pinecone Inference
    dense_response = await run_in_threadpool(
        lambda: _pc.inference.embed(
            model="multilingual-e5-large",
            inputs=[query],
            parameters={"input_type": "query"},
        )
    )
    dense_vector = dense_response[0].values

    # Sparse encoding
    sparse_vector = bm25.encode_queries(query)

    # Hybrid query
    results = await run_in_threadpool(
        lambda: index.query(
            vector=dense_vector,
            sparse_vector=sparse_vector,
            top_k=top_k,
            namespace="normative",
            include_metadata=True,
        )
    )

    return [
        {
            "text": m.metadata.get("text", ""),
            "score": m.score,
            "article_code": m.metadata.get("article_code"),
            "category": m.metadata.get("category"),
            "price": m.metadata.get("price"),
            "unit": m.metadata.get("unit"),
        }
        for m in results.matches
    ]
```

## Alpha Tuning Guide

| Query type | Recommended alpha | Reason |
|---|---|---|
| "Quanto costa demolire..." | 0.75 | Semantic intent + demolire keyword |
| "Codice 01.01.001" | 0.2 | Exact article code lookup |
| "Normativa murature portanti" | 0.85 | Mostly semantic |
| "prezzo mc calcestruzzo" | 0.5 | Mixed: unit (mc) is keyword, calcestruzzo is semantic |

## Metadata Filtering

Pinecone supports metadata pre-filtering before vector search:

```python
# Filter by category — retrieve only demolition items
index.query(
    vector=dense_vector,
    sparse_vector=sparse_vector,
    filter={"category": {"$contains": "DEMOLIZIONI"}},
    top_k=5,
)

# Filter by price range
index.query(
    filter={"price": {"$gte": 50.0, "$lte": 200.0}},
    ...
)
```

## Rollback Plan

If `syd-knowledge-v2` underperforms, revert by setting `PINECONE_INDEX_NAME=syd-knowledge` in `.env`.
The old dense-only index remains untouched during migration.
