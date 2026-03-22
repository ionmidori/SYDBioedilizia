import os
import sys
import asyncio
import logging
import argparse
from pathlib import Path

# Add the project root to the python path to import src modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.services.rag_service import RAGService

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)-8s | [%(name)s] %(message)s")
logger = logging.getLogger("IngestionPipeline")

def chunk_text(text: str, max_chars: int = 1000, overlap: int = 100) -> list[str]:
    """
    Very crude character-based chunker with overlap.
    In production, you'd use a RecursiveCharacterTextSplitter from langchain-text-splitters
    or a specialized Markdown splitter.
    """
    chunks = []
    # If text is small, return as is
    if len(text) <= max_chars:
        return [text]
    
    # Try to split by double newline (paragraphs) first
    paragraphs = text.split("\n\n")
    current_chunk = ""
    
    for para in paragraphs:
        if len(current_chunk) + len(para) + 2 <= max_chars:
            if current_chunk:
                current_chunk += "\n\n" + para
            else:
                current_chunk = para
        else:
            if current_chunk:
                chunks.append(current_chunk)
            current_chunk = para
            
    if current_chunk:
        chunks.append(current_chunk)
        
    return chunks

async def ingest_directory(directory_path: str, namespace: str = "normative"):
    """Reads all markdown files in a directory and upserts them to RAG."""
    target_dir = Path(directory_path)
    if not target_dir.exists() or not target_dir.is_dir():
        logger.error(f"Directory {directory_path} not found.")
        return

    rag_service = RAGService()
    if not rag_service.pc:
        logger.error("Pinecone Service could not initialize (missing API keys). Aborting.")
        return

    docs_to_upsert = []
    file_count = 0

    for file_path in target_dir.rglob("*.md"):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
            
            logger.info(f"Processing {file_path.name}...")
            # Chunk the file
            chunks = chunk_text(content)
            
            # Prepare for upsert
            for i, chunk in enumerate(chunks):
                docs_to_upsert.append({
                    "text": chunk,
                    "source": file_path.name,
                    "chunk_index": i
                })
            file_count += 1
        except Exception as e:
            logger.error(f"Failed to read {file_path.name}: {e}")

    logger.info(f"Generated {len(docs_to_upsert)} chunks from {file_count} files.")
    
    if docs_to_upsert:
        res = await rag_service.upsert_documents(docs_to_upsert, namespace=namespace)
        if res:
            logger.info(f"Successfully ingrained {file_count} documents into namespace '{namespace}'.")
        else:
            logger.error("Upsert operation failed.")
    else:
        logger.warning("No valid content found to upsert.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest Markdown files into SYD Pinecone Knowledge Base")
    parser.add_argument("--dir", type=str, required=True, help="Directory containing .md files to ingest")
    parser.add_argument("--namespace", type=str, default="normative", help="Pinecone namespace to use")
    
    args = parser.parse_args()
    
    asyncio.run(ingest_directory(args.dir, args.namespace))
