# PDF Ingestion Pipeline — Docling + Chonkie

## Install

```bash
uv add docling chonkie pinecone-text
```

## Full Pipeline: `scripts/extract_prezzario.py`

```python
"""
Re-ingestion pipeline for Tariffa Prezzi Regione Lazio 2023.
Replaces the old flat-text extraction with Docling TableFormer.
"""
import asyncio
from pathlib import Path
from docling.document_converter import DocumentConverter
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from chonkie import SemanticChunker
from pinecone import Pinecone
from pinecone_text.sparse import BM25Encoder

PDF_PATH = Path("data/tariffa_lazio_2023.pdf")
INDEX_NAME = "syd-knowledge-v2"
NAMESPACE = "normative"

# ── 1. Docling extraction ────────────────────────────────────────────────────

def extract_document(pdf_path: Path):
    options = PdfPipelineOptions(do_table_structure=True)
    converter = DocumentConverter(
        format_options={InputFormat.PDF: options}
    )
    return converter.convert(str(pdf_path)).document


def build_chunks(doc) -> list[dict]:
    """Extract table rows and narrative text as separate chunks."""
    chunks = []

    # Table rows → structured chunks
    for table in doc.tables:
        df = table.export_to_dataframe()
        category = _infer_category(table)
        for _, row in df.iterrows():
            text = " | ".join(f"{col}: {val}" for col, val in row.items() if val)
            if len(text.strip()) < 10:
                continue
            chunks.append({
                "text": text,
                "metadata": {
                    "chunk_type": "table_row",
                    "category": category,
                    "article_code": str(row.get("Codice", "")),
                    "unit": str(row.get("U.M.", "")),
                    "price": _parse_price(row.get("Prezzo", "")),
                    "source": "tariffa_lazio_2023",
                    "language": "it",
                }
            })

    # Narrative text → semantic chunks
    chunker = SemanticChunker(
        embedding_model="minishlab/potion-base-8M",
        chunk_size=400,
        threshold=0.5,
    )
    for text_item in doc.texts:
        if len(text_item.text) < 50:
            continue
        for chunk in chunker.chunk(text_item.text):
            chunks.append({
                "text": chunk.text,
                "metadata": {
                    "chunk_type": "narrative",
                    "source": "tariffa_lazio_2023",
                    "language": "it",
                }
            })

    return chunks


def _infer_category(table) -> str:
    """Try to extract category from table caption or surrounding context."""
    if table.caption:
        return table.caption.text[:100]
    return "unknown"


def _parse_price(val) -> float:
    try:
        return float(str(val).replace(",", ".").replace("€", "").strip())
    except (ValueError, TypeError):
        return 0.0


# ── 2. BM25 fit ──────────────────────────────────────────────────────────────

def fit_bm25(chunks: list[dict]) -> BM25Encoder:
    bm25 = BM25Encoder.default()
    bm25.fit([c["text"] for c in chunks])
    bm25.dump("data/bm25_prezzario.json")  # save for reuse
    return bm25


# ── 3. Upsert to Pinecone ─────────────────────────────────────────────────────

def upsert_chunks(chunks: list[dict], bm25: BM25Encoder, api_key: str):
    pc = Pinecone(api_key=api_key)

    # Create index if needed (dotproduct required for hybrid)
    if INDEX_NAME not in [i.name for i in pc.list_indexes()]:
        pc.create_index(
            name=INDEX_NAME,
            dimension=1024,  # multilingual-e5-large
            metric="dotproduct",
            spec={"serverless": {"cloud": "aws", "region": "us-east-1"}},
        )

    index = pc.Index(INDEX_NAME)
    batch_size = 100

    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        texts = [c["text"] for c in batch]

        # Dense embeddings via Pinecone Inference
        embeddings = pc.inference.embed(
            model="multilingual-e5-large",
            inputs=texts,
            parameters={"input_type": "passage"},
        )

        # Sparse vectors via BM25
        sparse_vectors = bm25.encode_documents(texts)

        vectors = []
        for j, (chunk, dense, sparse) in enumerate(
            zip(batch, embeddings, sparse_vectors)
        ):
            vectors.append({
                "id": f"prezzario-{i + j}",
                "values": dense.values,
                "sparse_values": sparse,
                "metadata": {**chunk["metadata"], "text": chunk["text"][:500]},
            })

        index.upsert(vectors=vectors, namespace=NAMESPACE)
        print(f"Upserted {i + len(batch)}/{len(chunks)} chunks")


# ── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import os
    api_key = os.environ["PINECONE_API_KEY"]

    print("1/3 Extracting document with Docling...")
    doc = extract_document(PDF_PATH)
    chunks = build_chunks(doc)
    print(f"    → {len(chunks)} chunks extracted")

    print("2/3 Fitting BM25Encoder...")
    bm25 = fit_bm25(chunks)

    print("3/3 Upserting to Pinecone...")
    upsert_chunks(chunks, bm25, api_key)
    print("Done.")
```

## Metadata Notes

- `article_code` maps to Prezzario article numbers (e.g. `01.01.001`) — use for exact-match filtering
- `price` stored as float for range queries (`metadata.price >= 100`)
- `chunk_type: "table_row"` enables filtering to only structured price data
- `category` enables filtering by work category (demolizioni, murature, etc.)

## Column Name Mapping (Prezzario Lazio 2023)

Typical headers extracted by Docling:
| PDF Column | Metadata field |
|---|---|
| Codice / N° | `article_code` |
| Descrizione | included in `text` |
| U.M. | `unit` |
| Prezzo Unitario / Euro | `price` |
| Capitolo / Categoria | `category` |
