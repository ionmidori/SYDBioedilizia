"""
Unit tests for the PricingService.

Skill: fastapi-enterprise-patterns — §Service Layer / Unit Testing
Rule #20: When creating a Service, create tests/unit/test_{service}.py

Verifies: SKU loading, per-item calculation, financial aggregation, and
full quote construction from an AI-provided SKU list.
"""
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import ValidationError
from src.schemas.quote import QuoteItem
from src.services.pricing_service import PricingService

# ─── Price Book Loading ───────────────────────────────────────────────────────

class TestLoadPriceBook:
    def test_price_book_is_non_empty(self):
        """Price book JSON must have at least one entry."""
        book = PricingService.load_price_book()
        assert len(book) > 0

    def test_every_entry_has_sku_key(self):
        """All items in the price book must expose a 'sku' field."""
        book = PricingService.load_price_book()
        for entry in book:
            assert entry.get("sku") is not None, f"Entry missing 'sku': {entry}"


# ─── SKU Lookup ───────────────────────────────────────────────────────────────

class TestGetItemBySku:
    def test_known_sku_returns_correct_item(self):
        """DEM-001 must be in the master price book at 25.00 €/unit."""
        item = PricingService.get_item_by_sku("DEM-001")
        assert item is not None
        assert item["sku"] == "DEM-001"
        assert item["unit_price"] == 25.0

    def test_unknown_sku_returns_none(self):
        """Lookups for non-existent SKUs must return None, not raise."""
        item = PricingService.get_item_by_sku("NOT-EXIST-999")
        assert item is None


# ─── Item Total Calculation ───────────────────────────────────────────────────

class TestCalculateItemTotal:
    def test_basic_multiplication(self):
        """total = qty × unit_price."""
        item = QuoteItem(
            sku="TEST",
            description="Test Item",
            unit="mq",
            qty=10.0,
            unit_price=25.0,
            total=0.0,
        )
        assert PricingService.calculate_item_total(item) == 250.0

    def test_zero_qty_returns_zero(self):
        item = QuoteItem(
            sku="TEST", description="d", unit="u", qty=0.0, unit_price=100.0, total=0.0
        )
        assert PricingService.calculate_item_total(item) == 0.0


# ─── Financial Aggregation ────────────────────────────────────────────────────

class TestCalculateFinancials:
    def test_subtotal_vat_grand_total(self):
        items = [
            QuoteItem(sku="A", description="A", unit="x", qty=1, unit_price=100.0, total=100.0),
            QuoteItem(sku="B", description="B", unit="x", qty=2, unit_price=50.0, total=100.0),
        ]
        financials = PricingService.calculate_financials(items, vat_rate=0.22)
        assert financials.subtotal == 200.0
        assert financials.vat_amount == 44.0
        assert financials.grand_total == 244.0

    def test_zero_vat_rate(self):
        items = [QuoteItem(sku="A", description="A", unit="x", qty=1, unit_price=100.0, total=100.0)]
        financials = PricingService.calculate_financials(items, vat_rate=0.0)
        assert financials.vat_amount == 0.0
        assert financials.grand_total == 100.0


# ─── Full Quote Construction ──────────────────────────────────────────────────

class TestCreateQuoteFromSkus:
    def test_single_sku_quote(self):
        """End-to-end: AI SKU list → Quote with correct items and financials."""
        sku_list = [{"sku": "DEM-001", "qty": 10.0, "ai_reasoning": "Remove old floor"}]
        quote = PricingService.create_quote_from_skus("proj1", "user1", sku_list)
        assert len(quote.items) == 1
        assert quote.items[0].sku == "DEM-001"
        assert quote.items[0].total == 250.0  # 10 × 25.0
        assert quote.financials.grand_total == pytest.approx(305.0, abs=0.01)  # + 22% VAT

    def test_unknown_sku_in_list_is_skipped(self):
        """SKUs not in the price book must be silently skipped (no KeyError)."""
        sku_list = [
            {"sku": "DEM-001", "qty": 5.0, "ai_reasoning": "Known SKU"},
            {"sku": "UNKNOWN-999", "qty": 1.0, "ai_reasoning": "Hallucinated SKU"},
        ]
        quote = PricingService.create_quote_from_skus("proj1", "user1", sku_list)
        skus_in_quote = [item.sku for item in quote.items]
        assert "DEM-001" in skus_in_quote
        assert "UNKNOWN-999" not in skus_in_quote


# ─── Amounts: Decimal, half-up to the cent (src/core/money.py) ────────────────

class TestHalfUpAmounts:
    def test_a_half_cent_line_rounds_up(self):
        """0.5 × 22.25 = 11.125 → 11.13 (Python round() gave 11.12, the admin preview 11.13)."""
        item = QuoteItem(sku="T", description="d", unit="mq", qty=0.5, unit_price=22.25, total=0)
        assert PricingService.calculate_item_total(item) == Decimal("11.13")

    def test_financials_are_decimal_in_the_model_and_numbers_when_dumped(self):
        items = [
            QuoteItem(sku="A", description="A", unit="x", qty=1, unit_price=0.1, total=0.1),
            QuoteItem(sku="B", description="B", unit="x", qty=1, unit_price=0.2, total=0.2),
        ]
        financials = PricingService.calculate_financials(items, vat_rate=0.22)
        # 0.1 + 0.2 as floats is 0.30000000000000004: the subtotal is now exact cents.
        assert (financials.subtotal, financials.vat_amount, financials.grand_total) == (
            Decimal("0.30"), Decimal("0.07"), Decimal("0.37"),
        )
        dumped = financials.model_dump()
        assert dumped == {"subtotal": 0.3, "vat_rate": 0.22, "vat_amount": 0.07, "grand_total": 0.37}
        assert all(type(v) is float for v in dumped.values())

    def test_quote_from_skus_uses_the_same_rule(self, monkeypatch):
        monkeypatch.setattr(
            PricingService, "get_item_by_sku",
            classmethod(lambda cls, sku: {"sku": sku, "description": "Posa", "unit": "mq", "unit_price": 22.25}),
        )
        quote = PricingService.create_quote_from_skus("p", "u", [{"sku": "POS-001", "qty": 0.5}])
        assert quote.items[0].total == Decimal("11.13")
        assert quote.financials.grand_total == Decimal("13.58")  # 11.13 + 2.45 (11.13 × 0.22 = 2.4486)


async def test_pricing_engine_tool_returns_a_json_number_rounded_half_up(monkeypatch):
    from src.adk.tools import pricing_engine_tool

    async def fresh() -> None:
        return None

    monkeypatch.setattr(PricingService, "ensure_fresh", fresh)
    monkeypatch.setattr(
        PricingService, "get_item_by_sku",
        classmethod(lambda cls, sku: {"sku": sku, "description": "Posa", "unit": "mq", "unit_price": 22.25}),
    )
    monkeypatch.setattr("src.adk.tools.is_anonymous_user", AsyncMock(return_value=False))
    result = await pricing_engine_tool("POS-001", 0.5, tool_context=MagicMock(user_id="uid-1"))
    assert result["total"] == 11.13 and type(result["total"]) is float


@pytest.mark.parametrize("field", ["qty", "unit_price"])
@pytest.mark.parametrize("bad", [float("inf"), float("nan")])
def test_a_line_rejects_non_finite_quantities_and_prices(field, bad):
    """Python's json accepts `Infinity`/`NaN`: the schema must answer 422, not let
    the money arithmetic raise later (500)."""
    data = {"sku": "T", "description": "d", "unit": "mq", "qty": 1, "unit_price": 1, "total": 0, field: bad}
    with pytest.raises(ValidationError):
        QuoteItem(**data)
