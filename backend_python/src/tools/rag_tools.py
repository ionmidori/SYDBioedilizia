"""
RAG Tools wrappers for ADK consumption.
"""
import logging
from src.services.rag_service import RAGService

logger = logging.getLogger(__name__)

async def retrieve_knowledge_wrapper(query: str) -> str:
    """Passes the query to Pinecone RAG and formats the result as a string."""
    rag_service = RAGService()
    
    if not rag_service.pc:
         return "Error: Pinecone RAG Service not configured (missing API keys from environment)."
         
    try:
        results = await rag_service.search(query=query, top_k=5)
        
        if not results:
            return "No relevant information found in the knowledge base."
            
        formatted_output = "Relevant findings from knowledge base:\n\n"
        for idx, result in enumerate(results, 1):
            metadata = result.get("metadata", {})
            content = metadata.get("chunk_text", "No content text")
            source = metadata.get("source", "Unknown Source")
            score = result.get("score", 0.0)
            formatted_output += f"--- Result {idx} (Relevance: {score:.2f}, Source: {source}) ---\n{content}\n\n"
            
        return formatted_output
    except Exception as e:
        logger.error(f"RAG wrapper error: {e}", exc_info=True)
        return f"Error retrieving knowledge: {e}"
