"""
Unit tests for the PricingService.

Skill: fastapi-enterprise-patterns — §Service Layer / Unit Testing
Rule #20: When creating a Service, create tests/unit/test_{service}.py

Verifies: SKU loading, per-item calculation, financial aggregation, and
full quote construction from an AI-provided SKU list.
"""
import pytest
from src.services.pricing_service import PricingService
from src.schemas.quote import QuoteItem


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
