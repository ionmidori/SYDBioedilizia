---
name: implementing-rag
description: Build Retrieval-Augmented Generation (RAG) systems for LLM applications with vector databases and semantic search. Use when working with knowledge-grounded AI or document Q&A systems.
---

# RAG Implementation

Master Retrieval-Augmented Generation (RAG) to build LLM applications that provide accurate, grounded responses using external knowledge sources.

## Core Components

1. **Vector Databases**: Pinecone (Serverless), Chroma (Local), pgvector.
2. **Embeddings**: `models/text-embedding-004` (Gemini), `voyage-3-large`.
3. **Retrieval**: Semantic similarity, Hybrid search, and Reranking.

## Advanced Patterns & Optimization

For complex retrieval strategies, see:
- **[RETRIEVAL_PATTERNS.md](RETRIEVAL_PATTERNS.md)**: Hybrid Search, Multi-Query, HyDE, and Parent Document Retrieval.
- **[RETRIEVAL_PATTERNS.md#6-retrieval-optimization](RETRIEVAL_PATTERNS.md)**: Metadata filtering, MMR, and Reranking implementation.

## Implementation Guide

### 1. Document Indexing
Use a production-ready pipeline for chunking and upserting.
**Refer to [scripts/index_documents.py](scripts/index_documents.py)** for a complete idempotent indexing template.

### 2. Basic RAG Chain (LangGraph)
```python
# Simplified RAG workflow
from langgraph.graph import StateGraph, START, END

async def retrieve(state: RAGState):
    docs = await retriever.ainvoke(state["question"])
    return {"context": docs}

async def generate(state: RAGState):
    # LLM generation with context
    response = await llm.ainvoke(prompt.format(context=state["context"]))
    return {"answer": response.content}
```

## Document Chunking
- **Recursive Splitting**: Preferred for natural language.
- **Semantic Chunking**: Breaks text at semantic shifts using embedding distance.
- **Markdown Splitting**: Preserves header structure for technical docs.

## Evaluation
Grounding and retrieval quality should be measured systematically.
**See the [evaluating-llms](../evaluating-llms/SKILL.md)** skill for metrics (Faithfulness, Relevance).

## Best Practices
1. **Idempotent Indexing**: Use unique document IDs to avoid duplicate chunks.
2. **Recursive Overlap**: Use 10-15% overlap to maintain boundary context.
3. **Hybrid Recall**: Always start with hybrid search if keywords are important (e.g., SKU numbers, names).
4. **Citability**: Return metadata sources (`source`, `page`) in the final response.
