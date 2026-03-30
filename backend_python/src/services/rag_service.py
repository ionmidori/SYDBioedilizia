"""
RAG Service using Pinecone and Serverless Integrated Inference.
Provides semantic search capabilities over renovation knowledge base without needing local embedding.

Namespaces:
    - 'prezzario': Structured price-list articles (Tariffa Regionale Lazio 2023)
    - 'normative': Regulatory knowledge, building codes, bonus fiscali
"""
import hashlib
import logging
import asyncio
from typing import List, Dict, Any, Optional
import uuid

from pinecone import Pinecone, ServerlessSpec, CloudProvider, AwsRegion, EmbedModel, IndexEmbed
from pinecone import SearchQuery

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
    ) -> List[Dict[str, Any]]:
        """
        Searches the Pinecone database using Integrated Inference.

        Args:
            query: Natural language query.
            top_k: Maximum number of results to return.
            filter_dict: Optional metadata filter (e.g. {"categoria": {"$eq": "Demolizioni"}}).
            namespace: Pinecone namespace to search.

        Returns:
            List of result dicts with 'id', 'score', and 'metadata' keys.
        """
        if not self.index:
            logger.warning("RAGService: Pinecone index not initialized.")
            return []
            
        try:
            query_kwargs: Dict[str, Any] = {
                "inputs": {"text": query},
                "top_k": top_k,
            }
            if filter_dict:
                query_kwargs["filter"] = filter_dict
                
            response = self.index.search_records(
                namespace=namespace,
                query=SearchQuery(**query_kwargs),
            )
            
            dict_resp = response.to_dict() if hasattr(response, 'to_dict') else response
            hits = dict_resp.get("result", {}).get("hits", []) or dict_resp.get("matches", [])
            
            results = []
            for match in hits:
                record = match.get("fields", match.get("metadata", {}))
                score = match.get("score", 0.0)
                results.append({
                    "id": match.get("_id") or match.get("id") or record.get("_id"),
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
            batch_size = 90
            for i in range(0, len(records), batch_size):
                batch = records[i:i + batch_size]
                self.index.upsert_records(namespace=namespace, records=batch)
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
