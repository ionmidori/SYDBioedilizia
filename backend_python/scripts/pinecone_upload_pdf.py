import os
import sys
import asyncio
import logging
import argparse
import time
from pathlib import Path
from pypdf import PdfReader

# Add the project root to the python path to import src modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.services.rag_service import RAGService

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)-8s | [%(name)s] %(message)s")
logger = logging.getLogger("PineconeUpload")

def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text from a PDF file using pypdf."""
    reader = PdfReader(pdf_path)
    text = ""
    for page in reader.pages:
        extracted = page.extract_text()
        if extracted:
            text += extracted + "\n"
    return text

def chunk_text(text: str, max_chars: int = 1500, overlap: int = 150) -> list[str]:
    """
    Chunk text by splitting on paragraphs, keeping chunks under max_chars.
    Includes a slight overlap to prevent cutting context abruptly.
    """
    chunks = []
    if len(text) <= max_chars:
        return [text]
    
    # Try to split by double newline (paragraphs) first
    paragraphs = text.split("\n\n")
    current_chunk = ""
    
    for para in paragraphs:
        # If a single paragraph is larger than max_chars, we must slice it forcefully
        if len(para) > max_chars:
            # First, append whatever we had in current_chunk
            if current_chunk:
                chunks.append(current_chunk)
                current_chunk = ""
            
            # Slice the huge paragraph into max_chars chunks
            for i in range(0, len(para), max_chars - overlap):
                slice_chunk = para[i:i + max_chars]
                if len(slice_chunk) > 50: # Avoid tiny tail chunks
                    chunks.append(slice_chunk)
            continue

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

async def ingest_pdf(pdf_path: str, namespace: str = "normative"):
    """Reads a PDF file, chunks it, and upserts to Pinecone."""
    target_file = Path(pdf_path)
    if not target_file.exists() or not target_file.is_file():
        logger.error(f"File {pdf_path} not found.")
        return

    rag_service = RAGService()
    if not rag_service.pc:
        logger.error("Pinecone Service could not initialize (missing API keys). Aborting.")
        return

    docs_to_upsert = []

    try:
        logger.info(f"Extracting text from {target_file.name}...")
        content = extract_text_from_pdf(str(target_file))
        
        logger.info(f"Extracted {len(content)} characters. Chunking...")
        chunks = chunk_text(content)
        
        for i, chunk in enumerate(chunks):
            # Assicurarsi che il testo sia compatto e senza spazi bianchi eccessivi
            clean_chunk = " ".join(chunk.split())
            if len(clean_chunk) > 10:  # Ignore empty chunks
                docs_to_upsert.append({
                    "text": clean_chunk,
                    "source": target_file.name,
                    "chunk_index": i
                })
            
        logger.info(f"Generated {len(docs_to_upsert)} chunks.")
    except Exception as e:
        logger.error(f"Failed to process {target_file.name}: {e}")
        return
    
    if docs_to_upsert:
        try:
            batch_size = 90
            for i in range(0, len(docs_to_upsert), batch_size):
                batch = docs_to_upsert[i:i + batch_size]
                # Usa il metodo della classe invece dell'oggetto interno
                await rag_service.upsert_documents(batch, namespace=namespace)
                logger.info(f"Upserted batch {i//batch_size + 1}/{(len(docs_to_upsert) + batch_size - 1)//batch_size}")
                # Rate limiting: wait 20 seconds between batches to avoid 250k token/min limit
                # We have ~493 chunks. Each chunk is max 1500 chars (~400 tokens).
                # 90 chunks = ~36k tokens. So 5 batches per minute is safe.
                if i + batch_size < len(docs_to_upsert):
                    logger.info("Waiting 15s to respect Pinecone Free Tier rate limits...")
                    time.sleep(15)
                    
            logger.info(f"Successfully ingrained {target_file.name} into namespace '{namespace}'.")
        except Exception as e:
            logger.error(f"Upsert operation failed: {e}", exc_info=True)
    else:
        logger.warning("No valid content found to upsert.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest PDF file into SYD Pinecone Knowledge Base")
    parser.add_argument("--file", type=str, required=True, help="Path to the PDF file to ingest")
    parser.add_argument("--namespace", type=str, default="normative", help="Pinecone namespace to use")
    
    args = parser.parse_args()
    
    asyncio.run(ingest_pdf(args.file, args.namespace))
