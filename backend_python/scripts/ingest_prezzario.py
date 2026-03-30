"""
Ingest structured prezzario JSON into Pinecone namespace 'prezzario'.

Reads the JSON output from extract_prezzario.py and upserts each article
as a searchable record with rich metadata (codice, categoria, prezzo, unita_misura).

Usage:
    uv run python scripts/ingest_prezzario.py
    uv run python scripts/ingest_prezzario.py --file data/prezzario_lazio_2023_structured.json
    uv run python scripts/ingest_prezzario.py --wipe   # wipe namespace first, then ingest
"""
import os
import sys
import json
import asyncio
import logging
import argparse
from pathlib import Path

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.services.rag_service import RAGService, NAMESPACE_PREZZARIO, NAMESPACE_NORMATIVE

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | [%(name)s] %(message)s",
)
logger = logging.getLogger("IngestPrezzario")


def build_chunks(articles: list[dict]) -> list[dict]:
    """Build Pinecone-ready chunks from structured articles.

    Each article becomes one record with:
    - chunk_text: searchable text (code + full description + category)
    - codice, categoria, unita_misura, prezzo_euro: filterable metadata
    - source: provenance tag
    """
    chunks = []
    for art in articles:
        codice = art.get("codice", "N/D")
        descrizione = art.get("descrizione", "")
        unita = art.get("unita_misura", "")
        prezzo = art.get("prezzo_euro", 0.0)
        categoria = art.get("categoria", "")

        # Compose rich text for embedding
        # This text is what multilingual-e5-large will embed for semantic search
        chunk_text = (
            f"Codice articolo: {codice}. "
            f"Categoria: {categoria}. "
            f"{descrizione}. "
            f"Unità di misura: {unita}. "
            f"Prezzo unitario: €{prezzo:.2f}."
        )

        chunks.append({
            "text": chunk_text,
            "codice": codice,
            "categoria": categoria,
            "unita_misura": unita,
            "prezzo_euro": prezzo,
            "source": "Tariffa Regionale Lazio 2023 - Opere Edili",
        })

    return chunks


async def main_async(args):
    """Async entrypoint for ingestion."""
    json_path = Path(args.file)
    if not json_path.exists():
        logger.error(f"JSON file not found: {json_path}")
        return

    with open(json_path, "r", encoding="utf-8") as f:
        articles = json.load(f)

    logger.info(f"Loaded {len(articles)} articles from {json_path}")

    rag = RAGService()
    if not rag.index:
        logger.error("RAGService failed to initialize. Check PINECONE_API_KEY.")
        return

    # Print current stats
    stats = rag.get_stats()
    if stats:
        logger.info(f"Index stats BEFORE: {json.dumps(stats, indent=2)}")

    # Optional: wipe namespace first
    if args.wipe:
        logger.warning(f"Wiping namespace '{NAMESPACE_PREZZARIO}' before ingestion...")
        success = await rag.delete_namespace(NAMESPACE_PREZZARIO)
        if success:
            logger.info(f"Namespace '{NAMESPACE_PREZZARIO}' wiped successfully.")
        else:
            logger.error(f"Failed to wipe namespace. Aborting.")
            return

        # Brief pause after wipe (Pinecone consistency)
        import time
        time.sleep(3)

    # Also wipe old normative namespace if requested
    if args.wipe_normative:
        logger.warning(f"Wiping namespace '{NAMESPACE_NORMATIVE}'...")
        await rag.delete_namespace(NAMESPACE_NORMATIVE)
        import time
        time.sleep(3)

    # Build and ingest
    chunks = build_chunks(articles)
    logger.info(f"Built {len(chunks)} chunks. Starting upsert to namespace '{NAMESPACE_PREZZARIO}'...")

    success = await rag.upsert_documents(chunks, namespace=NAMESPACE_PREZZARIO)

    if success:
        logger.info("✅ Ingestion complete!")
        # Brief pause for Pinecone to index
        import time
        time.sleep(5)
        stats = rag.get_stats()
        if stats:
            logger.info(f"Index stats AFTER: {json.dumps(stats, indent=2)}")
    else:
        logger.error("❌ Ingestion failed.")


def main():
    parser = argparse.ArgumentParser(description="Ingest structured prezzario into Pinecone")
    parser.add_argument(
        "--file",
        type=str,
        default="data/prezzario_lazio_2023_structured.json",
        help="Path to the structured JSON file",
    )
    parser.add_argument(
        "--wipe",
        action="store_true",
        help="Wipe prezzario namespace before ingestion",
    )
    parser.add_argument(
        "--wipe-normative",
        action="store_true",
        help="Also wipe normative namespace (for full reset)",
    )
    args = parser.parse_args()

    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
