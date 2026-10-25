import asyncio
import logging
import time
from datetime import datetime
from decimal import Decimal
from typing import Any

from google.api_core.exceptions import GoogleAPIError
from google.auth.exceptions import GoogleAuthError

from src.core.money import compute_totals, line_total
from src.db.firebase_client import get_async_firestore_client
from src.schemas.quote import QuoteFinancials, QuoteItem, QuoteSchema
from src.services import price_book
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

# How long an instance trusts what it read, and how soon it retries after a
# failed read. Edits made in the admin console reach every instance within the TTL.
PRICE_BOOK_TTL_SECONDS = 60.0
PRICE_BOOK_RETRY_SECONDS = 15.0
_REFRESH_TIMEOUT_SECONDS = 5.0


class PricingService:
    """Deterministic pricing over the master price book.

    The price book lives in Firestore (`app_config/price_book`, edited from the
    admin console); the bundled JSON is the seed and the fallback. Reads stay
    synchronous and never block on I/O: `load_price_book()` returns what was
    last loaded, and async entry points call `ensure_fresh()` first, which renews it
    in the background when the TTL has expired. If Firestore is unreachable the previous (or seed)
    price book keeps serving — quoting never stops because of a config read.
    """

    _master_price_book: list[dict[str, Any]] | None = None  # bundled seed
    _live_price_book: list[dict[str, Any]] | None = None  # from Firestore, if any
    _live_version: int = 0
    _live_updated_at: datetime | None = None
    _refresh_after: float = 0.0  # time.monotonic() deadline
    _loaded_once: bool = False  # the first load is awaited, later ones run in the background
    _refresh_lock: asyncio.Lock | None = None
    _refresh_task: asyncio.Task[None] | None = None

    @classmethod
    def load_price_book(cls) -> list[dict[str, Any]]:
        if cls._live_price_book is not None:
            return cls._live_price_book
        if cls._master_price_book is None:
            cls._master_price_book = price_book.seed_items()
        return cls._master_price_book

    @classmethod
    def price_book_version(cls) -> int:
        """0 while serving the seed."""
        return cls._live_version if cls._live_price_book is not None else 0

    @classmethod
    def apply_price_book(cls, items: list[dict[str, Any]], version: int, updated_at: datetime | None = None) -> None:
        """Make this instance serve a price book it just saved or read.

        Never goes back in time: a slow read of an older save must not replace
        a newer one made while it was in flight. (Ordered by save time, not by
        version number: a document reset by another tool restarts at version 1.)
        """
        if (
            cls._live_price_book is not None
            and updated_at is not None
            and cls._live_updated_at is not None
            and updated_at < cls._live_updated_at
        ):
            return
        cls._live_price_book = items
        cls._live_version = version
        cls._live_updated_at = updated_at
        cls._loaded_once = True
        cls._refresh_after = time.monotonic() + PRICE_BOOK_TTL_SECONDS

    @classmethod
    def reset_price_book_cache(cls) -> None:
        cls._master_price_book = None
        cls._live_price_book = None
        cls._live_version = 0
        cls._live_updated_at = None
        cls._refresh_after = 0.0
        cls._loaded_once = False
        cls._refresh_task = None

    @classmethod
    async def ensure_fresh(cls) -> None:
        """Keep the price book current without ever slowing a chat turn.

        The very first call (normally the startup warm-up) waits for Firestore.
        After that, an expired TTL starts ONE background refresh and the caller
        keeps using the price book it already has. Never raises.
        """
        if time.monotonic() < cls._refresh_after:
            return
        if not cls._loaded_once:
            await cls.refresh_now()
            return
        if cls._refresh_task is None or cls._refresh_task.done():
            cls._refresh_task = asyncio.get_running_loop().create_task(cls.refresh_now())

    @classmethod
    async def refresh_now(cls) -> None:
        """Read the price book from Firestore now. Never raises."""
        if cls._refresh_lock is None:
            cls._refresh_lock = asyncio.Lock()
        async with cls._refresh_lock:
            if time.monotonic() < cls._refresh_after:
                return  # another caller refreshed it while this one waited
            cls._loaded_once = True  # one attempt, success or not, ends the blocking first load
            try:
                state = await asyncio.wait_for(
                    price_book.read_state(get_async_firestore_client()), _REFRESH_TIMEOUT_SECONDS
                )
            except (GoogleAPIError, GoogleAuthError, OSError, RuntimeError, ValueError) as exc:
                logger.warning(
                    "[PriceBook] Refresh failed, keeping the current price book [%s].", type(exc).__name__
                )
                cls._refresh_after = time.monotonic() + PRICE_BOOK_RETRY_SECONDS
                return
            if state.problem is not None:
                # The stored document cannot be trusted (already logged): keep what is being served.
                cls._refresh_after = time.monotonic() + PRICE_BOOK_TTL_SECONDS
            elif state.source == "firestore":
                cls.apply_price_book(state.items, state.version, state.updated_at)
            else:
                cls._live_price_book = None
                cls._live_version = 0
                cls._live_updated_at = None
                cls._refresh_after = time.monotonic() + PRICE_BOOK_TTL_SECONDS

    @classmethod
    def get_item_by_sku(cls, sku: str) -> dict[str, Any] | None:
        price_book = cls.load_price_book()
        for item in price_book:
            if item["sku"] == sku:
                return item
        return None

    @classmethod
    def calculate_item_total(cls, item: QuoteItem) -> Decimal:
        return line_total(item.qty, item.unit_price)

    @classmethod
    def calculate_financials(cls, items: list[QuoteItem], vat_rate: float = 0.22) -> QuoteFinancials:
        """Totals from the line totals already on the items (see src/core/money.py)."""
        totals = compute_totals((item.total for item in items), vat_rate)
        return QuoteFinancials(
            subtotal=totals.subtotal,
            vat_rate=vat_rate,
            vat_amount=totals.vat_amount,
            grand_total=totals.grand_total,
        )

    @classmethod
    def create_quote_from_skus(cls, project_id: str, user_id: str, sku_list: list[dict[str, Any]]) -> QuoteSchema:
        """
        sku_list: List of dicts with {"sku": str, "qty": float, "ai_reasoning": Optional[str],
        "room_id": Optional[str]}
        """
        items = []
        for sku_data in sku_list:
            sku = sku_data["sku"]
            qty = sku_data["qty"]
            reasoning = sku_data.get("ai_reasoning")

            master_item = cls.get_item_by_sku(sku)
            if master_item:
                unit_price = master_item["unit_price"]
                total = line_total(qty, unit_price)

                item = QuoteItem(
                    sku=sku,
                    description=master_item["description"],
                    unit=master_item["unit"],
                    qty=qty,
                    unit_price=unit_price,
                    total=total,
                    ai_reasoning=reasoning,
                    category=master_item.get("category"),
                    manual_override=False,
                    room_id=sku_data.get("room_id"),
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
