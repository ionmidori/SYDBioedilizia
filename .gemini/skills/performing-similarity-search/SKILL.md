---
name: performing-similarity-search
description: Implement efficient similarity search with vector databases. Use when building semantic search, implementing nearest neighbor queries, or optimizing retrieval performance.
---

# Similarity Search Patterns

Patterns for implementing efficient similarity search in production systems, adapted for **Google Gemini** and **Pinecone**.

## When to Use This Skill
- Building semantic search systems
- Implementing RAG retrieval
- Creating recommendation engines
- Optimizing search latency
- Scaling to millions of vectors
- Combining semantic and keyword search

## Core Concepts

### 1. Distance Metrics
| Metric             | Formula            | Best For              |
| ------------------ | ------------------ | --------------------- |
| **Cosine**         | 1 - (A·B)/(‖A‖‖B‖) | Normalized embeddings |
| **Euclidean (L2)** | √Σ(a-b)²           | Raw embeddings        |
| **Dot Product**    | A·B                | Magnitude matters     |

### 2. Index Types
- **Flat (Exact)**: O(n) search, 100% recall. Best for < 100k vectors.
- **HNSW (Graph)**: O(log n), ~99% recall. Best for > 100k vectors (Default in Pinecone).
- **IVF (Quantized)**: Fast, lower memory. Best for > 10M vectors.

## Templates

### Template 1: Pinecone Implementation (Gemini Edition)
```python
from pinecone import Pinecone, ServerlessSpec
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from typing import List, Dict, Optional
import os
import time

class PineconeSearchService:
    def __init__(
        self,
        api_key: str,
        index_name: str,
        dimension: int = 768, # models/text-embedding-004 dimension
        metric: str = "cosine"
    ):
        self.pc = Pinecone(api_key=api_key)
        self.embeddings = GoogleGenerativeAIEmbeddings(
            model="models/text-embedding-004",
            google_api_key=os.environ.get("GOOGLE_API_KEY")
        )

        # Create index if not exists
        if index_name not in self.pc.list_indexes().names():
            self.pc.create_index(
                name=index_name,
                dimension=dimension,
                metric=metric,
                spec=ServerlessSpec(cloud="aws", region="us-east-1")
            )
            # Wait for index to be ready
            time.sleep(10)

        self.index = self.pc.Index(index_name)

    async def upsert_documents(self, documents: List[str], metadatas: List[Dict]):
        """Embed and upsert documents."""
        # Batch embedding
        vectors = await self.embeddings.aembed_documents(documents)
        
        # Prepare for Pinecone
        records = []
        for i, (vec, meta) in enumerate(zip(vectors, metadatas)):
            doc_id = meta.get("id", f"doc_{i}")
            records.append({
                "id": doc_id,
                "values": vec,
                "metadata": meta
            })

        # Batch upsert (100 at a time)
        batch_size = 100
        for i in range(0, len(records), batch_size):
            batch = records[i:i + batch_size]
            self.index.upsert(vectors=batch)

    async def search(
        self,
        query: str,
        top_k: int = 5,
        filter: Optional[Dict] = None
    ) -> List[Dict]:
        """Search for similar documents."""
        # Embed query
        query_vector = await self.embeddings.aembed_query(query)

        # Search Pinecone
        results = self.index.query(
            vector=query_vector,
            top_k=top_k,
            filter=filter,
            include_metadata=True
        )

        return [
            {
                "id": match.id,
                "score": match.score,
                "content": match.metadata.get("content"),
                "metadata": match.metadata
            }
            for match in results.matches
        ]
```

### Template 2: Semantic Clustering (K-Means)
Use this to group similar documents (topics) in your dataset.

```python
import numpy as np
from sklearn.cluster import KMeans
from langchain_google_genai import GoogleGenerativeAIEmbeddings

async def cluster_documents(documents: List[str], num_clusters: int = 5):
    """Cluster documents using Gemini embeddings and K-Means."""
    
    embeddings_model = GoogleGenerativeAIEmbeddings(model="models/text-embedding-004")
    
    # 1. Get Embeddings
    vectors = await embeddings_model.aembed_documents(documents)
    matrix = np.array(vectors)

    # 2. Cluster
    kmeans = KMeans(n_clusters=num_clusters, random_state=42)
    kmeans.fit(matrix)
    labels = kmeans.labels_

    # 3. Group results
    clusters = {i: [] for i in range(num_clusters)}
    for i, doc in enumerate(documents):
        clusters[labels[i]].append(doc)

    return clusters
```

### Template 3: Semantic Classification (K-NN)
Simple zero-shot classification using embeddings.

```python
import numpy as np
from collections import Counter

async def classify_text(
    text: str,
    examples: List[str],
    labels: List[str],
    k: int = 3
) -> str:
    """Classify text based on nearest labeled examples."""
    model = GoogleGenerativeAIEmbeddings(model="models/text-embedding-004")

    # Embed everything
    text_vec = await model.aembed_query(text)
    example_vecs = await model.aembed_documents(examples)

    # Calculate distances (Cosine Similarity)
    def cosine_sim(a, b):
        return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

    scores = [cosine_sim(text_vec, ex) for ex in example_vecs]
    
    # Find top K nearest neighbors
    top_indices = np.argsort(scores)[::-1][:k]
    top_labels = [labels[i] for i in top_indices]

    # Majority vote
    most_common = Counter(top_labels).most_common(1)[0][0]
    return most_common
```

## Best Practices

### Do's
- **Use appropriate index**: HNSW for most cases (Pinecone Default).
- **Monitor recall**: Measure search quality (Relevant / Retrieved).
- **Pre-filter when possible**: Use metadata filters to reduce search space and improve accuracy.
- **Normalize embeddings**: `text-embedding-004` is normalized, use Cosine Similarity.

### Don'ts
- **Don't ignore latency**: P99 matters for UX. Use batching.
- **Don't over-fetch**: Retrieve small `k` first, then fetch full docs if needed.
- **Don't forget costs**: Vector storage adds up. Use `768` dimensions for `text-embedding-004`.
