# Advanced Retrieval Patterns for RAG

Advanced strategies for improving recall and precision in Retrieval-Augmented Generation systems.

## 1. Hybrid Search with RRF
Combine dense (semantic) and sparse (keyword) retrieval.
```python
from langchain.retrievers import EnsembleRetriever
# Combine with Reciprocal Rank Fusion weights
ensemble_retriever = EnsembleRetriever(
    retrievers=[bm25_retriever, dense_retriever],
    weights=[0.3, 0.7]
)
```

## 2. Multi-Query Retrieval
Generate multiple query variations to capture different perspectives.
```python
from langchain.retrievers.multi_query import MultiQueryRetriever
multi_query_retriever = MultiQueryRetriever.from_llm(retriever=vectorstore.as_retriever(), llm=llm)
```

## 3. Contextual Compression
Extract only relevant portions of documents to reduce context window noise.
```python
from langchain.retrievers import ContextualCompressionRetriever
from langchain.retrievers.document_compressors import LLMChainExtractor
compression_retriever = ContextualCompressionRetriever(base_compressor=LLMChainExtractor.from_llm(llm), base_retriever=retriever)
```

## 4. Parent Document Retriever
Store small chunks for retrieval but return large parent chunks for generation context.
```python
from langchain.retrievers import ParentDocumentRetriever
# Small chunks for precision, large chunks for context
parent_retriever = ParentDocumentRetriever(vectorstore=vectorstore, docstore=docstore, child_splitter=child_splitter, parent_splitter=parent_splitter)
```

## 5. HyDE (Hypothetical Document Embeddings)
Generate a hypothetical answer first, then use its embedding for retrieval.
```python
# Step 1: LLM generates hypothetical answer
# Step 2: Retrieve real docs using hypothetical answer's embedding
```

## 6. Retrieval Optimization
- **Metadata Filtering**: Use `filter={"category": "value"}` to narrow search space.
- **MMR (Maximal Marginal Relevance)**: Balance relevance with diversity (`lambda_mult=0.5`).
- **Reranking**: Use Cross-Encoders (e.g., `cross-encoder/ms-marco-MiniLM`) or Cohere Rerank for precision.
