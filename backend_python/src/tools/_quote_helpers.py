"""
Shared helpers for quote generation (chat history, SKU validation, media extraction).
"""
import logging
from typing import Any, Dict, List


from src.services.pricing_service import PricingService

logger = logging.getLogger(__name__)

# Quantity bounds: reject AI-suggested quantities outside this range
_MIN_QTY = 0.01
_MAX_QTY = 10_000


def build_chat_summary(history: List[Dict[str, Any]], limit_chars: int = 500) -> str:
    """Extracts a readable summary from chat history, truncating long messages."""
    lines = []
    for msg in history:
        role = msg.get("role", "user")
        content = str(msg.get("content", ""))
        if len(content) > limit_chars:
            content = content[:limit_chars] + "..."
        lines.append(f"{role.upper()}: {content}")
    return "\n".join(lines)


def validate_sku_suggestions(suggestions: List[Any]) -> List[str]:
    """Verifies that suggested SKUs exist in the Price Book. Returns unknown SKUs."""
    price_book = PricingService.load_price_book()
    valid_skus = {i["sku"] for i in price_book}

    unknown_skus = []
    for s in suggestions:
        if s.sku not in valid_skus:
            unknown_skus.append(s.sku)
            logger.warning(f"[QS] SKU sconosciuto dall'AI: {s.sku}")

    return unknown_skus


def validate_qty_bounds(suggestions: List[Any]) -> tuple[List[Any], List[str]]:
    """
    Filters out suggestions with quantities outside safe bounds.
    Returns (valid_suggestions, list_of_warning_messages).
    """
    valid = []
    warnings = []
    for s in suggestions:
        qty = getattr(s, "qty", None)
        if qty is None or qty < _MIN_QTY or qty > _MAX_QTY:
            msg = f"SKU {s.sku}: qty={qty} rejected (must be {_MIN_QTY} <= qty <= {_MAX_QTY})"
            logger.warning(f"[QuoteHelper] Qty out of bounds — {msg}")
            warnings.append(msg)
        else:
            valid.append(s)
    return valid, warnings


def extract_media_urls(history: List[Dict[str, Any]]) -> List[str]:
    """
    Extracts all media URLs from chat history attachments.

    Handles both storage formats:
    - Structured: {"images": [...], "videos": [...]}
    - Legacy list: [{"url": "...", "type": "image"}, ...]
    """
    urls: List[str] = []
    for msg in history:
        raw = msg.get("attachments")
        if not raw:
            continue
        if isinstance(raw, dict):
            for url in raw.get("images") or []:
                if url:
                    urls.append(url)
            for url in raw.get("videos") or []:
                if url:
                    urls.append(url)
        elif isinstance(raw, list):
            for att in raw:
                if isinstance(att, dict) and att.get("url"):
                    urls.append(att["url"])
    return urls


def extract_vision_context(history: List[Dict[str, Any]]) -> str:
    """
    Extracts the structured vision analysis of the original room photo from chat history.

    The Designer agent writes a structured Italian analysis with fields like
    "Tipo stanza", "Stile attuale", etc.
    """
    vision_block_lines: List[str] = []
    for msg in history:
        if msg.get("role") != "assistant":
            continue
        content = str(msg.get("content", ""))
        if "Ho analizzato la tua foto" in content or "Tipo stanza" in content:
            vision_block_lines.append(content[:1200])
            break
    if vision_block_lines:
        return (
            "\n\n## Analisi Visiva Stanza Originale (Agentic Vision)\n"
            "L'assistente ha analizzato la foto originale del cliente con questo risultato:\n\n"
            + "\n".join(vision_block_lines)
            + "\n\nUsa questi dati per determinare lo STATO ATTUALE della stanza "
            "e identificare le demolizioni e preparazioni necessarie."
        )
    return ""
