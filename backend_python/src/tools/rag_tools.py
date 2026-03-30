"""
RAG Tools wrappers for ADK consumption.

Provides:
    - retrieve_knowledge: Semantic search across all namespaces (normative + prezzario)
    - retrieve_price_by_code: Exact lookup of a price-list article by its code
    - search_prezzario: Semantic search specifically in the price list
"""
import logging
from src.services.rag_service import RAGService, NAMESPACE_PREZZARIO, NAMESPACE_NORMATIVE

logger = logging.getLogger(__name__)


async def retrieve_knowledge(query: str) -> str:
    """Searches the SYD knowledge base for renovation-related information.

    Searches across both regulatory/normative knowledge and the regional
    price list (Tariffa Regionale Lazio 2023).

    Args:
        query: Natural language query about renovation topics, building
               regulations, pricing, or construction techniques.

    Returns:
        Formatted string with relevant findings, including source,
        relevance score, and any pricing information.
    """
    rag_service = RAGService()

    if not rag_service.pc:
        return "Error: Pinecone RAG Service not configured (missing API keys from environment)."

    try:
        results = await rag_service.search_multi_namespace(
            query=query,
            top_k=8,
        )

        if not results:
            return "No relevant information found in the knowledge base."

        formatted_output = "Relevant findings from knowledge base:\n\n"
        for idx, result in enumerate(results, 1):
            metadata = result.get("metadata", {})
            score = result.get("score", 0.0)
            namespace = result.get("namespace", "unknown")
            content = metadata.get("chunk_text", "No content text")
            source = metadata.get("source", "Unknown Source")

            # Prezzario-specific formatting
            codice = metadata.get("codice", "")
            prezzo = metadata.get("prezzo_euro")
            unita = metadata.get("unita_misura", "")
            categoria = metadata.get("categoria", "")

            formatted_output += f"--- Result {idx} (Score: {score:.2f}, Source: {source}, NS: {namespace}) ---\n"

            if codice:
                formatted_output += f"Codice: {codice}\n"
            if categoria:
                formatted_output += f"Categoria: {categoria}\n"
            if prezzo is not None and prezzo > 0:
                formatted_output += f"Prezzo: €{prezzo:.2f}/{unita}\n"

            formatted_output += f"{content}\n\n"

        return formatted_output
    except Exception as e:
        logger.error(f"RAG retrieve_knowledge error: {e}", exc_info=True)
        return f"Error retrieving knowledge: {e}"


async def search_prezzario(query: str, categoria: str = "") -> str:
    """Searches the regional price list (Tariffa Regionale Lazio 2023) for construction work items and prices.

    Use this tool when the user asks about costs, prices, or unit rates
    for specific construction work items (demolitions, flooring, painting, etc.).

    Args:
        query: Description of the work item to search for, e.g.
               'demolizione pavimento in marmo', 'tinteggiatura pareti al mq'.
        categoria: Optional category filter to narrow results, e.g.
                   'Demolizioni e Rimozioni', 'Tinteggiature e Verniciature'.

    Returns:
        Formatted string with matching price-list articles including
        code, description, unit of measure, and unit price.
    """
    rag_service = RAGService()

    if not rag_service.pc:
        return "Error: Pinecone RAG Service not configured."

    try:
        filter_dict = None
        if categoria:
            filter_dict = {"categoria": {"$eq": categoria}}

        results = await rag_service.search(
            query=query,
            top_k=10,
            filter_dict=filter_dict,
            namespace=NAMESPACE_PREZZARIO,
        )

        if not results:
            return f"Nessun articolo trovato nel prezzario per: '{query}'."

        formatted_output = f"Articoli dal Prezzario Regionale Lazio 2023 per '{query}':\n\n"
        for idx, result in enumerate(results, 1):
            metadata = result.get("metadata", {})
            score = result.get("score", 0.0)
            codice = metadata.get("codice", "N/D")
            descrizione = metadata.get("chunk_text", metadata.get("descrizione", ""))
            prezzo = metadata.get("prezzo_euro", 0.0)
            unita = metadata.get("unita_misura", "")
            categoria_art = metadata.get("categoria", "")

            formatted_output += f"{idx}. [{codice}] {descrizione}\n"
            if prezzo and prezzo > 0:
                formatted_output += f"   Prezzo: €{prezzo:.2f}/{unita}"
            else:
                formatted_output += f"   Prezzo: a corpo/N.D."
            formatted_output += f" | Categoria: {categoria_art} | Score: {score:.2f}\n\n"

        return formatted_output
    except Exception as e:
        logger.error(f"RAG search_prezzario error: {e}", exc_info=True)
        return f"Error searching prezzario: {e}"


async def retrieve_price_by_code(codice_articolo: str) -> str:
    """Looks up a specific price-list article by its exact code.

    Use this tool when the user references a specific article code like
    'A 3.02.14.a.' or 'A 14.01.15.b.' and wants the full details.

    Args:
        codice_articolo: The exact article code from the regional price list,
                         e.g. 'A 3.02.14.a.' or 'A 20.01.1.'

    Returns:
        Full details of the matching article, or a message if not found.
    """
    rag_service = RAGService()

    if not rag_service.pc:
        return "Error: Pinecone RAG Service not configured."

    try:
        results = await rag_service.search(
            query=codice_articolo,
            top_k=3,
            namespace=NAMESPACE_PREZZARIO,
        )

        if not results:
            return f"Articolo '{codice_articolo}' non trovato nel prezzario."

        # Find exact match first, then closest
        exact_match = None
        for r in results:
            r_codice = r.get("metadata", {}).get("codice", "")
            if r_codice.strip().lower() == codice_articolo.strip().lower():
                exact_match = r
                break

        target = exact_match or results[0]
        metadata = target.get("metadata", {})
        codice = metadata.get("codice", codice_articolo)
        descrizione = metadata.get("chunk_text", metadata.get("descrizione", "N/D"))
        prezzo = metadata.get("prezzo_euro", 0.0)
        unita = metadata.get("unita_misura", "")
        categoria = metadata.get("categoria", "")

        output = f"📋 Articolo {codice}\n"
        output += f"Categoria: {categoria}\n"
        output += f"Descrizione: {descrizione}\n"
        if prezzo and prezzo > 0:
            output += f"Prezzo unitario: €{prezzo:.2f}/{unita}\n"
        else:
            output += f"Prezzo: a corpo / da definire\n"

        if not exact_match:
            output += f"\n⚠️ Nota: corrispondenza approssimativa (codice esatto non trovato)."

        return output
    except Exception as e:
        logger.error(f"RAG retrieve_price_by_code error: {e}", exc_info=True)
        return f"Error looking up article: {e}"
