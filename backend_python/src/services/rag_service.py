"""
RAG Service using Pinecone and Serverless Integrated Inference.
Provides semantic search capabilities over renovation knowledge base without needing local embedding.

Namespaces:
    - 'prezzario': Structured price-list articles (Tariffa Regionale Lazio 2023)
    - 'normative': Regulatory knowledge, building codes, bonus fiscali
"""
import asyncio
import hashlib
import logging
import uuid
from typing import Any, Dict, List, Optional

from pinecone import AwsRegion, CloudProvider, EmbedModel, IndexEmbed, Pinecone, SearchQuery

from src.core.config import settings

logger = logging.getLogger(__name__)

# Default namespaces for SYD knowledge base
NAMESPACE_PREZZARIO = "prezzario"
NAMESPACE_NORMATIVE = "normative"


class RAGService:
    """Service to handle retrieval and indexing operations using Pinecone
    Integrated Inference with multilingual-e5-large."""

    def __init__(self):
        self.pc: Optional[Pinecone] = None
        self.index = None
        self._initialize()

    def _initialize(self):
        try:
            if settings.PINECONE_API_KEY:
                self.pc = Pinecone(api_key=settings.PINECONE_API_KEY)
                index_name = "syd-knowledge"

                if index_name in [idx.name for idx in self.pc.list_indexes()]:
                    self.index = self.pc.Index(index_name)
                    logger.info(f"Connected to Pinecone index: {index_name}")
                else:
                    logger.info(f"Pinecone index '{index_name}' not found. Creating it with Integrated Inference...")
                    index_config = self.pc.create_index_for_model(
                        name=index_name,
                        cloud=CloudProvider.AWS,
                        region=AwsRegion.US_EAST_1,
                        embed=IndexEmbed(
                            model=EmbedModel.Multilingual_E5_Large,
                            metric="cosine",
                            field_map={"text": "chunk_text"}
                        )
                    )
                    self.index = self.pc.Index(host=index_config.host)
                    logger.info(f"Successfully created and connected to index: {index_name}")

        except Exception as e:
            logger.error(f"Failed to initialize RAGService database: {e}", exc_info=True)
            self.pc = None
            self.index = None

    # ── Search ────────────────────────────────────────────────────────────────

    async def search(
        self,
        query: str,
        top_k: int = 5,
        filter_dict: Optional[Dict[str, Any]] = None,
        namespace: str = NAMESPACE_NORMATIVE,
        rerank: Optional[bool] = None,
        min_score: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        """
        Searches the Pinecone database using Integrated Inference.

        Args:
            query: Natural language query.
            top_k: Maximum number of results to return.
            filter_dict: Optional metadata filter (e.g. {"categoria": {"$eq": "Demolizioni"}}).
            namespace: Pinecone namespace to search.
            rerank: Override RAG_RERANK_ENABLED. When on, over-fetch
                top_k×RAG_RERANK_OVERFETCH candidates and rerank down to top_k
                with a cross-encoder — better precision on near-duplicate articles.
            min_score: Override RAG_MIN_SCORE. Drop hits below this relevance
                score (0.0 disables). Note rerank scores run higher than cosine.

        Returns:
            List of result dicts with 'id', 'score', and 'metadata' keys.
        """
        if not self.index:
            logger.warning("RAGService: Pinecone index not initialized.")
            return []

        use_rerank = settings.RAG_RERANK_ENABLED if rerank is None else rerank
        threshold = settings.RAG_MIN_SCORE if min_score is None else min_score

        try:
            # Over-fetch candidates when reranking so the cross-encoder has a
            # meaningful pool to re-order; otherwise fetch exactly top_k.
            fetch_k = top_k * max(1, settings.RAG_RERANK_OVERFETCH) if use_rerank else top_k
            query_kwargs: Dict[str, Any] = {
                "inputs": {"text": query},
                "top_k": fetch_k,
            }
            if filter_dict:
                query_kwargs["filter"] = filter_dict

            search_kwargs: Dict[str, Any] = {
                "namespace": namespace,
                "query": SearchQuery(**query_kwargs),
            }
            if use_rerank:
                # Pinecone hosted reranker expects a plain dict (the SearchRerank
                # object is not JSON-serializable by the data-plane client).
                search_kwargs["rerank"] = {
                    "model": settings.RAG_RERANK_MODEL,
                    "rank_fields": ["chunk_text"],
                    "top_n": top_k,
                }

            # Pinecone SDK call is synchronous → offload to a thread so it
            # never blocks the asyncio event loop (e.g. concurrent chat streams).
            response = await asyncio.to_thread(
                lambda: self.index.search(**search_kwargs)
            )

            dict_resp = response.to_dict() if hasattr(response, 'to_dict') else (response or {})
            hits = dict_resp.get("result", {}).get("hits", []) or dict_resp.get("matches", [])

            results = []
            for match in hits:
                record = match.get("fields", match.get("metadata", {})) or {}
                # SDK to_dict() emits 'score_'/'id_'; raw/MCP forms use '_score'/'_id'.
                score = (
                    match.get("score_")
                    or match.get("_score")
                    or match.get("score")
                    or 0.0
                )
                rec_id = (
                    match.get("id_")
                    or match.get("_id")
                    or match.get("id")
                    or record.get("_id")
                )
                if threshold and score < threshold:
                    continue
                results.append({
                    "id": rec_id,
                    "score": score,
                    "metadata": record,
                })
            return results
        except Exception as e:
            logger.error(f"Failed to search Pinecone: {e}", exc_info=True)
            return []

    async def search_multi_namespace(
        self,
        query: str,
        namespaces: Optional[List[str]] = None,
        top_k: int = 5,
        filter_dict: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Search across multiple namespaces and merge results by score.
        Useful when the agent needs both pricing and regulatory info.

        Args:
            query: Natural language query.
            namespaces: List of namespaces to search. Defaults to all.
            top_k: Results per namespace.
            filter_dict: Optional metadata filter.

        Returns:
            Merged results sorted by score (descending).
        """
        if namespaces is None:
            namespaces = [NAMESPACE_PREZZARIO, NAMESPACE_NORMATIVE]

        all_results: List[Dict[str, Any]] = []
        for ns in namespaces:
            ns_results = await self.search(
                query=query,
                top_k=top_k,
                filter_dict=filter_dict,
                namespace=ns,
            )
            # Tag each result with its namespace for traceability
            for r in ns_results:
                r["namespace"] = ns
            all_results.extend(ns_results)

        # Sort by relevance score (descending) and take top_k
        all_results.sort(key=lambda x: x.get("score", 0.0), reverse=True)
        return all_results[:top_k]

    # ── Upsert ────────────────────────────────────────────────────────────────

    async def upsert_documents(
        self,
        chunks: List[Dict[str, Any]],
        namespace: str = NAMESPACE_NORMATIVE,
    ) -> bool:
        """
        Takes a list of document chunks and upserts them using Integrated Inference.

        Each chunk dict should contain at minimum:
            - 'text': The text content (will be mapped to 'chunk_text' for Pinecone field_map)

        Optional fields are stored as metadata alongside the embedding.
        """
        if not self.index:
            logger.error("RAGService not fully initialized. Cannot upsert.")
            return False

        records = []
        for chunk in chunks:
            record = chunk.copy()
            # Use deterministic ID if 'codice' is present (idempotent for prezzario)
            if "codice" in record:
                record["_id"] = self._deterministic_id(record["codice"])
            else:
                record["_id"] = str(uuid.uuid4())

            # Map 'text' → 'chunk_text' for Pinecone Integrated Inference field_map
            record["chunk_text"] = chunk.get("text", "")
            if "text" in record:
                del record["text"]
            records.append(record)

        try:
            batch_size = 50
            total_batches = (len(records) + batch_size - 1) // batch_size
            for i in range(0, len(records), batch_size):
                batch = records[i:i + batch_size]
                batch_num = i // batch_size + 1
                logger.info(f"Upserting batch {batch_num}/{total_batches} ({len(batch)} records)...")
                # Sync SDK call → offload to a thread to avoid blocking the event loop.
                await asyncio.to_thread(
                    self.index.upsert_records, namespace=namespace, records=batch
                )
                if i + batch_size < len(records):
                    # Async sleep: respects the 250k TPM rate limit for
                    # multilingual-e5-large WITHOUT freezing the event loop.
                    await asyncio.sleep(8)
            logger.info(f"Successfully upserted {len(records)} chunks to Pinecone in namespace '{namespace}'.")
            return True
        except Exception as e:
            logger.error(f"Failed to upsert to Pinecone: {e}", exc_info=True)
            return False

    # ── Namespace Management ──────────────────────────────────────────────────

    async def delete_namespace(self, namespace: str) -> bool:
        """Completely wipe a namespace in Pinecone. Use with caution."""
        try:
            logger.warning(f"Wiping namespace '{namespace}'. This action is irreversible.")
            await asyncio.to_thread(self.index.delete, delete_all=True, namespace=namespace)
            logger.info(f"Successfully wiped namespace '{namespace}'.")
            return True
        except Exception as e:
            # Swallow 404 Namespace not found, it just means it's already empty
            if 'Namespace not found' in str(e) or '(404)' in str(e):
                logger.info(f"Namespace '{namespace}' already empty or not found.")
                return True
            logger.error(f"Failed to wipe namespace {namespace}: {e}")
            return False

    def get_stats(self) -> Optional[Dict[str, Any]]:
        """Returns index statistics (namespaces, vector counts)."""
        if not self.index:
            return None
        try:
            stats = self.index.describe_index_stats()
            return {
                "total_vectors": stats.total_vector_count,
                "dimension": stats.dimension,
                "namespaces": {
                    ns_name: ns_info.vector_count
                    for ns_name, ns_info in stats.namespaces.items()
                },
            }
        except Exception as e:
            logger.error(f"Failed to get index stats: {e}", exc_info=True)
            return None

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _deterministic_id(codice: str) -> str:
        """Generate a deterministic ID from article code for idempotent upserts."""
        return hashlib.sha256(codice.strip().encode("utf-8")).hexdigest()[:32]


# ── Singleton factory ────────────────────────────────────────────────────────
# Constructing RAGService() opens a Pinecone client and performs a list_indexes()
# network round-trip in _initialize(). The ADK tools used to build a fresh
# instance on every single tool call (i.e. every price lookup), adding latency
# and connection churn. This module-level singleton reuses one initialized
# client across the process.
_rag_service_singleton: Optional["RAGService"] = None


def get_rag_service() -> "RAGService":
    """Return the process-wide RAGService singleton (lazy-initialized)."""
    global _rag_service_singleton
    if _rag_service_singleton is None:
        _rag_service_singleton = RAGService()
    return _rag_service_singleton
