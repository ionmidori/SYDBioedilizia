import os
import re
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

def chunk_text(text: str, max_chars: int = 3000, overlap: int = 200) -> list[str]:
    """
    Chunk a regional price list (prezzario) by main article code.

    Splits on parent article boundaries like "A 14.01.24." (letter suffix absent),
    keeping each article's description + all sub-items (.a, .b, ...) in one chunk.
    This preserves the semantic unit: "what is the item" + "what are its prices".

    Articles larger than max_chars are sliced with overlap so at least the
    article header appears at the top of each continuation chunk.
    """
    # Match parent article codes: e.g. "A 14.01.24." but NOT "A 14.01.24.a."
    article_pattern = re.compile(r'(?=\b[A-Z]\s+\d+\.\d+\.\d+\.\s)', re.MULTILINE)
    parts = article_pattern.split(text)

    chunks: list[str] = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if len(part) <= max_chars:
            chunks.append(part)
        else:
            # Article too long: slice with overlap, prepending the header line each time
            header_end = part.find('\n')
            header = part[:header_end].strip() if header_end != -1 else ""
            for i in range(0, len(part), max_chars - overlap):
                slice_chunk = part[i:i + max_chars]
                # Re-attach header to continuation slices so context is preserved
                if i > 0 and header:
                    slice_chunk = header + " [continua]\n" + slice_chunk
                if len(slice_chunk) > 50:
                    chunks.append(slice_chunk)

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
