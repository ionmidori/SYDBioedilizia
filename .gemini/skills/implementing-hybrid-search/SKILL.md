---
name: implementing-hybrid-search
description: Combine vector and keyword search for improved retrieval. Use when implementing RAG systems, building search engines, or when neither approach alone provides sufficient recall.
---

# Hybrid Search Implementation

Patterns for combining vector similarity and keyword-based search.

## When to Use This Skill
- Building RAG systems with improved recall
- Combining semantic understanding with exact matching
- Handling queries with specific terms (names, codes)
- Improving search for domain-specific vocabulary
- When pure vector search misses keyword matches

## Core Concepts

### 1. Hybrid Search Architecture
```
Query → ┬─► Vector Search ──► Candidates ─┐
        │                                  │
        └─► Keyword Search ─► Candidates ─┴─► Fusion ─► Results
```

### 2. Fusion Methods
| Method            | Description              | Best For        |
| ----------------- | ------------------------ | --------------- |
| **RRF**           | Reciprocal Rank Fusion   | General purpose |
| **Linear**        | Weighted sum of scores   | Tunable balance |
| **Cross-encoder** | Rerank with neural model | Highest quality |
| **Cascade**       | Filter then rerank       | Efficiency      |

## Templates

### Template 1: Reciprocal Rank Fusion
```python
from typing import List, Tuple
from collections import defaultdict

def reciprocal_rank_fusion(
    result_lists: List[List[Tuple[str, float]]],
    k: int = 60,
    weights: List[float] = None
) -> List[Tuple[str, float]]:
    """
    Combine multiple ranked lists using RRF.

    Args:
        result_lists: List of (doc_id, score) tuples per search method
        k: RRF constant (higher = more weight to lower ranks)
        weights: Optional weights per result list

    Returns:
        Fused ranking as (doc_id, score) tuples
    """
    if weights is None:
        weights = [1.0] * len(result_lists)

    scores = defaultdict(float)

    for result_list, weight in zip(result_lists, weights):
        for rank, (doc_id, _) in enumerate(result_list):
            # RRF formula: 1 / (k + rank)
            scores[doc_id] += weight * (1.0 / (k + rank + 1))

    # Sort by fused score
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)


def linear_combination(
    vector_results: List[Tuple[str, float]],
    keyword_results: List[Tuple[str, float]],
    alpha: float = 0.5
) -> List[Tuple[str, float]]:
    """
    Combine results with linear interpolation.

    Args:
        vector_results: (doc_id, similarity_score) from vector search
        keyword_results: (doc_id, bm25_score) from keyword search
        alpha: Weight for vector search (1-alpha for keyword)
    """
    # Normalize scores to [0, 1]
    def normalize(results):
        if not results:
            return {}
        scores = [s for _, s in results]
        min_s, max_s = min(scores), max(scores)
        range_s = max_s - min_s if max_s != min_s else 1
        return {doc_id: (score - min_s) / range_s for doc_id, score in results}

    vector_scores = normalize(vector_results)
    keyword_scores = normalize(keyword_results)

    # Combine
    all_docs = set(vector_scores.keys()) | set(keyword_scores.keys())
    combined = {}

    for doc_id in all_docs:
        v_score = vector_scores.get(doc_id, 0)
        k_score = keyword_scores.get(doc_id, 0)
        combined[doc_id] = alpha * v_score + (1 - alpha) * k_score

    return sorted(combined.items(), key=lambda x: x[1], reverse=True)
```

### Template 2: Pinecone Hybrid Search (Sparse-Dense)
```python
from pinecone import Pinecone
import os

# Initialize Pinecone
pc = Pinecone(api_key=os.environ.get("PINECONE_API_KEY"))
index = pc.Index("my-index")

def hybrid_query(
    dense_vector: list[float],
    sparse_vector: dict, # {"indices": [int], "values": [float]}
    top_k: int = 10,
    alpha: float = 0.5
):
    """
    Perform hybrid search in Pinecone (dot product).
    Note: Requires index created with metric="dotproduct" for true hybrid.
    """
    # Scale vectors by alpha
    scaled_dense = [v * alpha for v in dense_vector]
    scaled_sparse = {
        "indices": sparse_vector["indices"],
        "values": [v * (1 - alpha) for v in sparse_vector["values"]]
    }
    
    return index.query(
        vector=scaled_dense,
        sparse_vector=scaled_sparse,
        top_k=top_k,
        include_metadata=True
    )
```

### Template 3: RRF Fusion (Generic)
```python
from typing import List, Tuple
from collections import defaultdict

def reciprocal_rank_fusion(
    result_lists: List[List[Tuple[str, float]]], # List of (doc_id, score) lists
    k: int = 60
) -> List[Tuple[str, float]]:
    """
    Combine multiple ranked lists using Reciprocal Rank Fusion.
    Useful for combining Pinecone results with Keyword Search results.
    """
    scores = defaultdict(float)

    for result_list in result_lists:
        for rank, (doc_id, _) in enumerate(result_list):
            scores[doc_id] += 1.0 / (k + rank + 1)

    return sorted(scores.items(), key=lambda x: x[1], reverse=True)
```


## Best Practices

### Do's
- **Tune weights empirically** - Test on your data
- **Use RRF for simplicity** - Works well without tuning
- **Add reranking** - Significant quality improvement
- **Log both scores** - Helps with debugging
- **A/B test** - Measure real user impact

### Don'ts
- **Don't assume one size fits all** - Different queries need different weights
- **Don't skip keyword search** - Handles exact matches better
- **Don't over-fetch** - Balance recall vs latency
- **Don't ignore edge cases** - Empty results, single word queries

## Resources
- [RRF Paper](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)
- [Vespa Hybrid Search](https://blog.vespa.ai/improving-text-ranking-with-few-shot-prompting/)
- [Cohere Rerank](https://docs.cohere.com/docs/reranking)
