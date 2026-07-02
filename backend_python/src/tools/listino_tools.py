"""
Customer-facing "listino" lookup over the curated master price book.

Unlike the analytic Pinecone prezzario (per-element unit prices, technical),
the master price book holds composite "fornitura e posa" packages with a
customer-friendly price RANGE. This tool answers quick "quanto costa X?"
questions; the analytic prezzario stays the fallback for niche items and the
detailed/formal quote.
"""
import logging
import re
import unicodedata
from typing import Any, Dict, List

from src.services.pricing_service import PricingService

logger = logging.getLogger(__name__)

# Sentinel so the agent prompt can branch to the prezzario fallback.
NO_LISTINO_MATCH = "NESSUNA_VOCE_LISTINO"

# Italian stopwords + generic price words that add no matching signal.
_STOPWORDS = {
    "di", "a", "da", "in", "con", "su", "per", "tra", "fra", "e", "ed", "o",
    "il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "del", "della",
    "dei", "delle", "al", "allo", "alla", "quanto", "costa", "costano",
    "prezzo", "prezzi", "costo", "costi", "euro", "mq", "metro", "metri",
    "quadro", "quadrato", "vorrei", "sapere", "circa", "fare", "che",
}


def _normalize(text: str) -> List[str]:
    """Lowercase, strip accents/punctuation, drop short words and stopwords."""
    text = unicodedata.normalize("NFKD", text.lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    tokens = re.findall(r"[a-z0-9]+", text)
    return [t for t in tokens if len(t) > 2 and t not in _STOPWORDS]


def _searchable(item: Dict[str, Any]) -> str:
    parts = [
        item.get("description", ""),
        item.get("category", ""),
        item.get("subcategory", ""),
        " ".join(item.get("tags", []) or []),
    ]
    return " ".join(parts)


def _format_eur(v: float) -> str:
    return f"{v:,.0f}".replace(",", ".")


async def search_listino(query: str, top_k: int = 4) -> str:
    """Searches the SYD customer price list for a quick installed-price range.

    Use this FIRST for customer questions like "quanto costa una finestra in
    PVC?" or "prezzo rifacimento bagno". Returns composite "fornitura e posa"
    items with an indicative price range. If nothing matches, returns the
    NESSUNA_VOCE_LISTINO sentinel so you can fall back to search_prezzario.

    Args:
        query: The work/material the customer is asking about.

    Returns:
        Formatted price-range list, or NESSUNA_VOCE_LISTINO if no match.
    """
    q_tokens = _normalize(query)
    if not q_tokens:
        return NO_LISTINO_MATCH

    items = PricingService.load_price_book()
    if not items:
        logger.error("[Listino] master price book is empty/unavailable.")
        return NO_LISTINO_MATCH

    scored: List[tuple[int, Dict[str, Any]]] = []
    for item in items:
        item_tokens = set(_normalize(_searchable(item)))
        if not item_tokens:
            continue
        score = sum(1 for t in q_tokens if t in item_tokens)
        if score > 0:
            scored.append((score, item))

    if not scored:
        return NO_LISTINO_MATCH

    # Keep only the strongest matches. When the query has multiple matching
    # tokens (best >= 2, e.g. "finestra pvc"), restrict to items hitting that
    # best score so a weaker single-token match ("finestra alluminio") doesn't
    # dilute a specific request. For single-token queries ("finestra"), show
    # all matches so the customer sees the available variants.
    scored.sort(key=lambda s: s[0], reverse=True)
    best = scored[0][0]
    threshold = best if best >= 2 else 1
    top = [it for sc, it in scored if sc >= threshold][:top_k]

    lines = ["Listino SYD — prezzi indicativi chiavi in mano (fornitura + posa):", ""]
    for it in top:
        rmin = it.get("range_min")
        rmax = it.get("range_max")
        unit = it.get("unit", "")
        if rmin and rmax:
            price = f"€{_format_eur(rmin)}–€{_format_eur(rmax)}/{unit}"
        else:
            price = f"~€{_format_eur(it.get('unit_price', 0))}/{unit}"
        lines.append(f"- {it.get('description')}: {price}")
    lines.append("")
    lines.append(
        "Sono fasce indicative (variano per misure, materiali e finiture). "
        "Per un importo preciso preparo un preventivo personalizzato."
    )
    return "\n".join(lines)
