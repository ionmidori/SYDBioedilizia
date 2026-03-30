"""
Extract structured data from the Tariffa Regionale Lazio 2023 PDF using Gemini 2.5 Flash.

Processes each page with Structured Output to produce a JSON file where each record
represents a single price-list article with code, description, unit, price, and category.

Output: data/prezzario_lazio_2023_structured.json

Usage:
    uv run python scripts/extract_prezzario.py
    uv run python scripts/extract_prezzario.py --pages 1-10   # extract subset
"""
import os
import sys
import json
import time
import logging
import argparse
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.core.config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | [%(name)s] %(message)s",
)
logger = logging.getLogger("ExtractPrezzario")


# ── Pydantic schemas for Gemini Structured Output ─────────────────────────────

class ArticoloPrezzario(BaseModel):
    """A single article/item from the regional price list."""
    codice: str = Field(
        ...,
        description="Full article code including sub-item letter, e.g. 'A 3.02.14.a.' or 'A 14.01.15.b.'",
    )
    descrizione: str = Field(
        ...,
        description="Complete description of the work item, in Italian. Merge multi-line descriptions into a single string.",
    )
    unita_misura: str = Field(
        ...,
        description="Unit of measurement: 'mq', 'mc', 'm', 'kg', 'cad', 'a corpo', etc.",
    )
    prezzo_euro: float = Field(
        ...,
        description="Unit price in EUR. Use dot as decimal separator.",
    )
    categoria: str = Field(
        ...,
        description="The chapter/section header this article belongs to, e.g. 'Demolizioni e Rimozioni', 'Pavimenti e Rivestimenti', 'Tinteggiature'.",
    )


class PaginaPrezzario(BaseModel):
    """All articles extracted from a single page of the PDF."""
    articoli: list[ArticoloPrezzario] = Field(
        default_factory=list,
        description="List of price-list articles found on this page. Empty if page has no articles (e.g. table of contents, cover page).",
    )


# ── Extraction logic ─────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
Sei un esperto estrattore di dati da preziari regionali italiani per l'edilizia.

Ti verrà fornita UNA PAGINA di un prezzario regionale (Tariffa Regione Lazio 2023, Parte A — Opere Edili).

Il tuo compito è estrarre OGNI articolo/voce presente nella pagina con i seguenti campi:
- codice: il codice identificativo completo (es. "A 3.02.14.a.")
- descrizione: la descrizione completa dell'articolo. Se la descrizione è spezzata su più righe, uniscile in un testo unico e coerente. NON troncare.
- unita_misura: l'unità di misura (mq, mc, m, kg, cad, a corpo, ecc.)
- prezzo_euro: il prezzo unitario in euro (numero con punto come separatore decimale)
- categoria: il capitolo/sezione di appartenenza (es. "Demolizioni e Rimozioni", "Scavi", "Murature", "Intonaci", "Pavimenti e Rivestimenti", "Tinteggiature e Verniciature", ecc.). Deducila dall'intestazione di pagina o dal contesto degli articoli.

REGOLE IMPORTANTI:
1. Se un articolo padre (es. "A 3.02.14") ha sotto-voci con lettere (a., b., c.), estrai CIASCUNA sotto-voce come articolo separato, includendo la descrizione del padre nella descrizione della sotto-voce.
2. Se la pagina non contiene articoli (es. indice, copertina, pagina vuota), restituisci una lista vuota.
3. I prezzi sono in formato italiano (virgola come separatore decimale nel PDF). Convertili in formato con punto: 8,80 → 8.80
4. Se una descrizione continua dalla pagina precedente (inizia a metà frase), fai del tuo meglio per renderla comprensibile aggiungendo "[segue]" all'inizio.
5. Non inventare dati. Se un campo non è leggibile, usa "N/D" per le stringhe e 0.0 per i prezzi.
"""


def extract_pages(pdf_path: str, start_page: int = 0, end_page: Optional[int] = None) -> list[ArticoloPrezzario]:
    """Extract structured articles from PDF pages using Gemini 2.5 Flash."""
    from google import genai
    from google.genai import types
    from pypdf import PdfReader, PdfWriter
    import io

    client = genai.Client(api_key=settings.api_key)
    reader = PdfReader(pdf_path)
    total_pages = len(reader.pages)

    if end_page is None or end_page > total_pages:
        end_page = total_pages

    logger.info(f"PDF has {total_pages} pages. Processing pages {start_page + 1} to {end_page}.")

    all_articles: list[ArticoloPrezzario] = []
    errors = 0

    for page_idx in range(start_page, end_page):
        page_num = page_idx + 1
        logger.info(f"Processing page {page_num}/{end_page}...")

        try:
            # Extract single page as a mini-PDF in memory
            writer = PdfWriter()
            writer.add_page(reader.pages[page_idx])
            buf = io.BytesIO()
            writer.write(buf)
            page_bytes = buf.getvalue()

            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    types.Part.from_bytes(data=page_bytes, mime_type="application/pdf"),
                    "Estrai tutti gli articoli del prezzario da questa pagina.",
                ],
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    response_mime_type="application/json",
                    response_schema=PaginaPrezzario,
                    temperature=0.0,
                ),
            )

            parsed: PaginaPrezzario = response.parsed
            page_articles = parsed.articoli if parsed else []

            if page_articles:
                all_articles.extend(page_articles)
                logger.info(f"  → Extracted {len(page_articles)} articles from page {page_num}")
            else:
                logger.info(f"  → No articles on page {page_num} (cover/index/blank)")

        except Exception as e:
            errors += 1
            logger.error(f"  ✗ Error on page {page_num}: {e}")

        # Rate limiting: ~15 RPM for free tier, be conservative
        if page_idx < end_page - 1:
            time.sleep(4.5)

    logger.info(f"\n{'='*60}")
    logger.info(f"EXTRACTION COMPLETE")
    logger.info(f"  Total articles: {len(all_articles)}")
    logger.info(f"  Pages processed: {end_page - start_page}")
    logger.info(f"  Errors: {errors}")
    logger.info(f"{'='*60}")

    return all_articles


def save_json(articles: list[ArticoloPrezzario], output_path: str):
    """Save extracted articles to JSON."""
    data = [a.model_dump() for a in articles]
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info(f"Saved {len(data)} articles to {output_path}")


def validate_output(articles: list[ArticoloPrezzario]) -> bool:
    """Run basic validation on extracted data."""
    if not articles:
        logger.error("VALIDATION FAILED: No articles extracted.")
        return False

    issues = 0
    for i, art in enumerate(articles):
        if not art.codice or art.codice == "N/D":
            logger.warning(f"  Article {i}: missing codice")
            issues += 1
        if not art.descrizione or len(art.descrizione) < 10:
            logger.warning(f"  Article {i} ({art.codice}): description too short")
            issues += 1
        if art.prezzo_euro == 0.0:
            logger.warning(f"  Article {i} ({art.codice}): price is 0.0")
            issues += 1

    # Stats
    categories = set(a.categoria for a in articles)
    units = set(a.unita_misura for a in articles)
    prices = [a.prezzo_euro for a in articles if a.prezzo_euro > 0]

    logger.info(f"\nVALIDATION SUMMARY:")
    logger.info(f"  Articles with issues: {issues}/{len(articles)}")
    logger.info(f"  Unique categories: {len(categories)} → {sorted(categories)}")
    logger.info(f"  Unique units: {units}")
    logger.info(f"  Price range: €{min(prices):.2f} - €{max(prices):.2f}" if prices else "  No valid prices")

    return issues < len(articles) * 0.1  # < 10% issues = pass


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Extract structured data from Tariffa Regionale Lazio PDF",
    )
    parser.add_argument(
        "--file",
        type=str,
        default="data/tariffa_lazio_2023_opere_edili.pdf",
        help="Path to the PDF file",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="data/prezzario_lazio_2023_structured.json",
        help="Output JSON path",
    )
    parser.add_argument(
        "--pages",
        type=str,
        default=None,
        help="Page range to process (e.g. '1-10'). Omit for all pages.",
    )
    args = parser.parse_args()

    # Parse page range
    start_page, end_page = 0, None
    if args.pages:
        parts = args.pages.split("-")
        start_page = int(parts[0]) - 1  # 0-indexed
        if len(parts) > 1:
            end_page = int(parts[1])

    pdf_path = Path(args.file)
    if not pdf_path.exists():
        logger.error(f"PDF file not found: {pdf_path}")
        sys.exit(1)

    logger.info(f"Starting extraction from: {pdf_path}")

    articles = extract_pages(str(pdf_path), start_page, end_page)

    if articles:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        save_json(articles, str(output_path))
        validate_output(articles)
    else:
        logger.warning("No articles extracted. Check the PDF and Gemini output.")


if __name__ == "__main__":
    main()
