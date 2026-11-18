"""
Tests for the customer listino lookup (src/tools/listino_tools.py).
Verifies keyword matching, range formatting, and the no-match sentinel.
"""
from unittest.mock import patch

import pytest
from src.adk.agents import SYD_ORCHESTRATOR_INSTRUCTION
from src.tools import listino_tools
from src.tools.listino_tools import NO_LISTINO_MATCH, _normalize, search_listino

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


@pytest.mark.asyncio
async def test_a_different_size_keeps_the_figures_and_says_the_size_differs():
    with patch.object(listino_tools.PricingService, "load_price_book", return_value=_FAKE_BOOK):
        out = await search_listino("finestra PVC 120x140")
    assert "€320–€630/cad" in out
    assert "vale per 60x120 cm" in out
    assert "120x140 cm" in out


@pytest.mark.asyncio
@pytest.mark.parametrize("query", ["finestra PVC 60x120", "finestra PVC 60 x 120 cm", "finestra PVC"])
async def test_the_same_size_or_no_size_adds_no_note(query: str):
    with patch.object(listino_tools.PricingService, "load_price_book", return_value=_FAKE_BOOK):
        out = await search_listino(query)
    assert "vale per" not in out


def test_the_price_inquiry_rule_keeps_listino_figures_unchanged():
    """A 120x140 window priced from the 60x120 item was rescaled by the model (11 Nov)."""
    assert "Riporta le cifre del listino ESATTAMENTE come le restituisce" in SYD_ORCHESTRATOR_INSTRUCTION
    assert "la misura è diversa" in SYD_ORCHESTRATOR_INSTRUCTION


_SIZED_BOOK = [
    *_FAKE_BOOK,
    {
        "sku": "PAV-001", "unit": "mq", "unit_price": 40.0,
        "description": "Posa in opera pavimento ceramica/gres porcellanato (format max 60x60)",
        "category": "Pavimenti", "subcategory": "Posa",
        "tags": ["pavimento", "gres"], "range_min": 30.0, "range_max": 50.0,
    },
    {
        "sku": "BAG-001", "unit": "cad", "unit_price": 700.0,
        "description": "Fornitura e posa box doccia in vetro temperato (80x80 o su misura)",
        "category": "Bagno", "subcategory": "Docce",
        "tags": ["box", "doccia"], "range_min": 500.0, "range_max": 900.0,
    },
]


@pytest.mark.asyncio
@pytest.mark.parametrize("query", ["finestra PVC 1,20x1,40 m", "finestra PVC 120 per 140", "finestra PVC 120*140"])
async def test_the_size_is_read_in_metres_or_with_per(query: str):
    with patch.object(listino_tools.PricingService, "load_price_book", return_value=_FAKE_BOOK):
        out = await search_listino(query)
    assert "vale per 60x120 cm; per 120x140 cm" in out


@pytest.mark.asyncio
async def test_the_same_size_written_the_other_way_round_adds_no_note():
    with patch.object(listino_tools.PricingService, "load_price_book", return_value=_FAKE_BOOK):
        out = await search_listino("finestra PVC 120x60")
    assert "vale per" not in out


@pytest.mark.asyncio
async def test_a_longer_number_is_not_read_as_a_size():
    with patch.object(listino_tools.PricingService, "load_price_book", return_value=_FAKE_BOOK):
        out = await search_listino("finestra PVC 1200x1400")
    assert "vale per" not in out


@pytest.mark.asyncio
@pytest.mark.parametrize("query", ["pavimento gres 300x400", "box doccia 90x90"])
async def test_a_size_that_is_a_limit_or_a_mq_price_adds_no_note(query: str):
    with patch.object(listino_tools.PricingService, "load_price_book", return_value=_SIZED_BOOK):
        out = await search_listino(query)
    assert "vale per" not in out


def test_the_prezzario_fallback_keeps_unit_prices_unscaled():
    assert "Non moltiplicare né riscalare i prezzi unitari" in SYD_ORCHESTRATOR_INSTRUCTION
