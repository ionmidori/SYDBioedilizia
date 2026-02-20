import json
import os
import logging
from typing import List, Dict, Any, Optional
from src.schemas.quote import QuoteItem, QuoteFinancials, QuoteSchema
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

class PricingService:
    _master_price_book = None

    @classmethod
    def load_price_book(cls):
        if cls._master_price_book is None:
            data_path = os.path.join(os.path.dirname(__file__), "..", "data", "master_price_book.json")
            try:
                with open(data_path, "r", encoding="utf-8") as f:
                    cls._master_price_book = json.load(f)["items"]
            except Exception as e:
                logger.error(f"[PricingService] Error loading price book: {e}")
                cls._master_price_book = []
        return cls._master_price_book

    @classmethod
    def get_item_by_sku(cls, sku: str) -> Optional[Dict[str, Any]]:
        price_book = cls.load_price_book()
        for item in price_book:
            if item["sku"] == sku:
                return item
        return None

    @classmethod
    def calculate_item_total(cls, item: QuoteItem) -> float:
        return round(item.qty * item.unit_price, 2)

    @classmethod
    def calculate_financials(cls, items: List[QuoteItem], vat_rate: float = 0.22) -> QuoteFinancials:
        subtotal = sum(item.total for item in items)
        vat_amount = round(subtotal * vat_rate, 2)
        grand_total = round(subtotal + vat_amount, 2)
        return QuoteFinancials(
            subtotal=subtotal,
            vat_rate=vat_rate,
            vat_amount=vat_amount,
            grand_total=grand_total
        )

    @classmethod
    def create_quote_from_skus(cls, project_id: str, user_id: str, sku_list: List[Dict[str, Any]]) -> QuoteSchema:
        """
        sku_list: List of dicts with {"sku": str, "qty": float, "ai_reasoning": Optional[str]}
        """
        items = []
        for sku_data in sku_list:
            sku = sku_data["sku"]
            qty = sku_data["qty"]
            reasoning = sku_data.get("ai_reasoning")
            
            master_item = cls.get_item_by_sku(sku)
            if master_item:
                unit_price = master_item["unit_price"]
                total = round(qty * unit_price, 2)
                
                item = QuoteItem(
                    sku=sku,
                    description=master_item["description"],
                    unit=master_item["unit"],
                    qty=qty,
                    unit_price=unit_price,
                    total=total,
                    ai_reasoning=reasoning,
                    category=master_item.get("category"),
                    manual_override=False
                )
                items.append(item)
            else:
                logger.warning(f"[PricingService] SKU {sku} not found in price book.")

        financials = cls.calculate_financials(items)
        return QuoteSchema(
            project_id=project_id,
            user_id=user_id,
            status="draft",
            items=items,
            financials=financials,
            created_at=utc_now(),
            updated_at=utc_now()
        )
