---
name: implementing-rag
description: Builds Retrieval-Augmented Generation systems using Google GenAI embeddings and Pinecone for SYD's knowledge-grounded AI features. Covers chunking, indexing, hybrid search, and evaluation. Use when implementing document Q&A, quote training from historical data, or knowledge retrieval.
---

# RAG Implementation — SYD Stack

## Tech Stack

| Component | SYD Choice |
|-----------|-----------|
| Embeddings | `models/text-embedding-004` (Google GenAI) |
| Vector DB | Pinecone (Serverless) |
| LLM | Gemini 2.5 Flash/Pro via Google ADK |
| Framework | Google ADK (NOT LangChain) |

## Indexing Pipeline

```python
from google import genai
from pinecone import Pinecone

client = genai.Client()
pc = Pinecone()
index = pc.Index("syd-knowledge")

async def index_document(doc_id: str, text: str, metadata: dict):
    # 1. Embed
    response = client.models.embed_content(
        model="models/text-embedding-004",
        contents=[text],
    )
    # 2. Upsert (idempotent via doc_id)
    index.upsert(vectors=[(doc_id, response.embeddings[0].values, metadata)])
```

## Chunking Strategies

- **Recursive splitting**: Default for natural language (500 tokens, 10-15% overlap)
- **Semantic chunking**: Split at embedding-distance shifts for technical docs
- **Markdown splitting**: Preserve headers for structured renovation documents

## Retrieval

```python
# Hybrid search: semantic + keyword (SKU codes, room types)
results = index.query(
    vector=query_embedding,
    top_k=10,
    filter={"room_type": {"$eq": "bagno"}},
    include_metadata=True,
)
```

## SYD Use Cases

1. **Quote training**: RAG from approved historical quotes → few-shot examples for InsightEngine
2. **Price book retrieval**: SKU lookup from `master_price_book.json` embeddings
3. **Renovation knowledge**: Building code references, material specifications

## Best Practices

1. **Idempotent indexing**: Use unique document IDs to prevent duplicate chunks
2. **Hybrid recall**: Always combine semantic + keyword for SKU numbers and technical terms
3. **Citability**: Return `source` and `page` metadata in responses
4. **Evaluation**: Use ADK eval rubrics (see [evaluating-adk-agents](../evaluating-adk-agents/SKILL.md)) to measure grounding quality
