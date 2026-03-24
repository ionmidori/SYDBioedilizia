"""
RAG Service using Pinecone and Serverless Integrated Inference.
Provides semantic search capabilities over renovation knowledge base without needing local embedding.
"""
import logging
from typing import List, Dict, Any, Optional
import uuid

from pinecone import Pinecone, ServerlessSpec, CloudProvider, AwsRegion, EmbedModel, IndexEmbed
from pinecone import SearchQuery

from src.core.config import settings

logger = logging.getLogger(__name__)

class RAGService:
    """Service to handle retrieval and indexing operations using Pinecone
    Integrated Inference with multilingual-e5-large."""
    
    def __init__(self):
        self.pc = None
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

    async def generate_embedding(self, text: str) -> Optional[List[float]]:
        # This is obsolete with Integrated Inference!
        # Handled automatically by Pinecone.
        return None

    async def search(self, query: str, top_k: int = 5, filter_dict: Optional[Dict[str, Any]] = None, namespace: str = "normative") -> List[Dict[str, Any]]:
        """
        Searches the Pinecone database using Integrated Inference.
        """
        if not self.index:
            logger.warning("RAGService: Pinecone index not initialized.")
            return []
            
        try:
            query_kwargs = {
                "inputs": {"text": query},
                "top_k": top_k
            }
            if filter_dict:
                query_kwargs["filter"] = filter_dict
                
            response = self.index.search_records(
                namespace=namespace,
                query=SearchQuery(**query_kwargs)
            )
            
            # Response is typically a dictionary containing 'result' -> 'hits'
            dict_resp = response.to_dict() if hasattr(response, 'to_dict') else response
            hits = dict_resp.get("result", {}).get("hits", []) or dict_resp.get("matches", [])
            
            results = []
            for match in hits:
                # The record metadata is inside "fields" for Integrated Inference
                record = match.get("fields", match.get("metadata", {}))
                score = match.get("score", 0.0)
                results.append({
                    "id": match.get("id") or record.get("_id") or record.get("id"),
                    "score": score,
                    "metadata": record  # We store all fields in the record, acting as metadata
                })
            return results
        except Exception as e:
            logger.error(f"Failed to search Pinecone: {e}", exc_info=True)
            return []

    async def upsert_documents(self, chunks: List[Dict[str, Any]], namespace: str = "normative") -> bool:
        """
        Takes a list of document chunks and upserts them using Integrated Inference.
        """
        if not self.index:
            logger.error("RAGService not fully initialized. Cannot upsert.")
            return False
            
        records = []
        for chunk in chunks:
            # Required fields: _id, and chunk_text
            record = chunk.copy()
            record["_id"] = str(uuid.uuid4())
            record["chunk_text"] = chunk.get("text", "")
            if "text" in record:
                del record["text"]  # avoid duplicate usage
            records.append(record)
            
        try:
            batch_size = 90
            for i in range(0, len(records), batch_size):
                batch = records[i:i + batch_size]
                self.index.upsert_records(namespace=namespace, records=batch)
            logger.info(f"Successfully upserted {len(records)} chunks to Pinecone in namespace {namespace}.")
            return True
        except Exception as e:
            logger.error(f"Failed to upsert to Pinecone: {e}", exc_info=True)
            return False
