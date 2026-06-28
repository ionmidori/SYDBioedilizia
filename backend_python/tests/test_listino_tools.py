"""
Tests for the customer listino lookup (src/tools/listino_tools.py).
Verifies keyword matching, range formatting, and the no-match sentinel.
"""
import pytest
from unittest.mock import patch

from src.tools import listino_tools
from src.tools.listino_tools import search_listino, NO_LISTINO_MATCH, _normalize

_FAKE_BOOK = [
    {
        "sku": "INF-FIN-001", "unit": "cad", "unit_price": 420.0,
        "description": "Fornitura e posa finestra PVC doppio vetro basso-emissivo (60x120 cm)",
        "category": "Infissi", "subcategory": "Finestre",
        "tags": ["finestra", "pvc", "infisso"], "range_min": 320.0, "range_max": 630.0,
    },
    {
        "sku": "INF-FIN-002", "unit": "cad", "unit_price": 680.0,
        "description": "Fornitura e posa finestra alluminio taglio termico triplo vetro (60x120 cm)",
        "category": "Infissi", "subcategory": "Finestre",
        "tags": ["finestra", "alluminio", "infisso"], "range_min": 510.0, "range_max": 1020.0,
    },
    {
        "sku": "DEM-001", "unit": "mq", "unit_price": 25.0,
        "description": "Demolizione tramezzi interni in laterizio",
        "category": "Demolizioni", "subcategory": "Strutture verticali",
        "tags": ["demolizione", "tramezzi"], "range_min": 20.0, "range_max": 30.0,
    },
]


def test_normalize_drops_stopwords_and_accents():
    assert _normalize("Quanto costa una finestra in PVC?") == ["finestra", "pvc"]


@pytest.mark.asyncio
async def test_finds_pvc_window_with_range():
    with patch.object(listino_tools.PricingService, "load_price_book", return_value=_FAKE_BOOK):
        out = await search_listino("quanto costa una finestra in PVC")
    assert "finestra PVC" in out
    assert "€320–€630/cad" in out
    # Query specifies PVC (2 tokens) → the weaker "finestra"-only alluminio
    # match must be excluded so the answer stays on-point.
    assert "alluminio" not in out


@pytest.mark.asyncio
async def test_generic_finestra_shows_variants():
    with patch.object(listino_tools.PricingService, "load_price_book", return_value=_FAKE_BOOK):
        out = await search_listino("quanto costa una finestra")
    # Single token "finestra" matches both variants → show them.
    assert "PVC" in out and "alluminio" in out


@pytest.mark.asyncio
async def test_returns_sentinel_when_no_match():
    with patch.object(listino_tools.PricingService, "load_price_book", return_value=_FAKE_BOOK):
        out = await search_listino("quanto costa una piscina interrata")
    assert out == NO_LISTINO_MATCH


@pytest.mark.asyncio
async def test_sentinel_on_empty_query():
    with patch.object(listino_tools.PricingService, "load_price_book", return_value=_FAKE_BOOK):
        assert await search_listino("quanto costa?") == NO_LISTINO_MATCH


@pytest.mark.asyncio
async def test_sentinel_when_book_unavailable():
    with patch.object(listino_tools.PricingService, "load_price_book", return_value=[]):
        assert await search_listino("finestra pvc") == NO_LISTINO_MATCH
