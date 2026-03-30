"""
Ingest normative markdown documents into Pinecone namespace 'normative'.

Reads markdown files from data/knowledge/normative/ and performs semantic
chunking before upserting to Pinecone with Integrated Inference.

Usage:
    uv run python scripts/ingest_normative.py
    uv run python scripts/ingest_normative.py --wipe   # wipe namespace first
"""
import os
import sys
import re
import asyncio
import logging
import argparse
from pathlib import Path

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.services.rag_service import RAGService, NAMESPACE_NORMATIVE

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | [%(name)s] %(message)s",
)
logger = logging.getLogger("IngestNormative")

# ── Semantic Chunking ─────────────────────────────────────────────────────────

def chunk_markdown(text: str, source_name: str, max_chunk_chars: int = 1500) -> list[dict]:
    """Split a markdown document into semantic chunks based on headers.

    Strategy: split on ## headers first, then on ### if chunks exceed max_chunk_chars.
    Each chunk retains the document title (first # header) as context.
    """
    lines = text.strip().split("\n")

    # Extract the document title (first H1)
    doc_title = ""
    for line in lines:
        if line.startswith("# ") and not line.startswith("## "):
            doc_title = line.lstrip("# ").strip()
            break

    # Split on ## headers
    sections: list[dict] = []
    current_header = doc_title
    current_lines: list[str] = []

    for line in lines:
        if line.startswith("## "):
            # Save previous section
            if current_lines:
                sections.append({
                    "header": current_header,
                    "text": "\n".join(current_lines).strip(),
                })
            current_header = line.lstrip("# ").strip()
            current_lines = [line]
        else:
            current_lines.append(line)

    # Last section
    if current_lines:
        sections.append({
            "header": current_header,
            "text": "\n".join(current_lines).strip(),
        })

    # Build chunks with context
    chunks = []
    for section in sections:
        section_text = section["text"]

        # If section is small enough, keep as one chunk
        if len(section_text) <= max_chunk_chars:
            chunk_text = f"Documento: {doc_title}. Sezione: {section['header']}.\n\n{section_text}"
            chunks.append({
                "text": chunk_text,
                "source": source_name,
                "section": section["header"],
                "document": doc_title,
                "content_type": "normative",
            })
        else:
            # Split large sections on ### sub-headers or paragraphs
            sub_chunks = _split_section(section_text, max_chunk_chars)
            for i, sub_text in enumerate(sub_chunks):
                chunk_text = f"Documento: {doc_title}. Sezione: {section['header']} (parte {i + 1}).\n\n{sub_text}"
                chunks.append({
                    "text": chunk_text,
                    "source": source_name,
                    "section": f"{section['header']} (part {i + 1})",
                    "document": doc_title,
                    "content_type": "normative",
                })

    return chunks


def _split_section(text: str, max_chars: int) -> list[str]:
    """Split a section by ### headers or by paragraphs."""
    # Try splitting by ### first
    parts = re.split(r"\n(?=### )", text)
    if len(parts) > 1:
        # Merge small contiguous parts
        return _merge_small_chunks(parts, max_chars)

    # Fallback: split by double newline (paragraphs)
    paragraphs = text.split("\n\n")
    return _merge_small_chunks(paragraphs, max_chars)


def _merge_small_chunks(parts: list[str], max_chars: int) -> list[str]:
    """Merge small consecutive parts until they approach max_chars."""
    merged = []
    current = ""
    for part in parts:
        if len(current) + len(part) + 2 <= max_chars:
            current = current + "\n\n" + part if current else part
        else:
            if current:
                merged.append(current.strip())
            current = part
    if current:
        merged.append(current.strip())
    return merged


# ── Main ──────────────────────────────────────────────────────────────────────

async def main_async(args):
    """Async entrypoint for normative ingestion."""
    docs_dir = Path(args.dir)
    if not docs_dir.exists():
        logger.error(f"Normative docs directory not found: {docs_dir}")
        return

    # Collect all .md files
    md_files = sorted(docs_dir.rglob("*.md"))
    if not md_files:
        logger.warning(f"No markdown files found in {docs_dir}")
        return

    logger.info(f"Found {len(md_files)} markdown file(s) in {docs_dir}")

    rag = RAGService()
    if not rag.index:
        logger.error("RAGService failed to initialize.")
        return

    # Optional wipe
    if args.wipe:
        logger.warning(f"Wiping namespace '{NAMESPACE_NORMATIVE}'...")
        await rag.delete_namespace(NAMESPACE_NORMATIVE)
        import time
        time.sleep(3)

    # Process each file
    all_chunks: list[dict] = []
    for md_file in md_files:
        logger.info(f"Processing: {md_file.name}")
        content = md_file.read_text(encoding="utf-8")
        file_chunks = chunk_markdown(content, source_name=md_file.name)
        all_chunks.extend(file_chunks)
        logger.info(f"  → {len(file_chunks)} chunks from {md_file.name}")

    logger.info(f"Total chunks: {len(all_chunks)}")

    # Upsert
    success = await rag.upsert_documents(all_chunks, namespace=NAMESPACE_NORMATIVE)

    if success:
        import time
        time.sleep(5)
        stats = rag.get_stats()
        logger.info(f"✅ Normative ingestion complete!")
        if stats:
            logger.info(f"Index stats: {stats}")
    else:
        logger.error("❌ Normative ingestion failed.")


def main():
    parser = argparse.ArgumentParser(description="Ingest normative markdown into Pinecone")
    parser.add_argument(
        "--dir",
        type=str,
        default="data/knowledge/normative",
        help="Directory containing normative .md files",
    )
    parser.add_argument(
        "--wipe",
        action="store_true",
        help="Wipe normative namespace before ingestion",
    )
    args = parser.parse_args()
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
