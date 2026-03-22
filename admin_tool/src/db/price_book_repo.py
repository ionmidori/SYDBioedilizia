"""
Price Book Repository: Firestore persistence for the Master Price Book.

Strategy: single document app_config/price_book with an `items` array.
This mirrors the JSON structure exactly, enabling zero-change dual-write.

Skill: building-admin-dashboards — §Firebase Firestore Integration
"""
import logging
from datetime import datetime, timezone
from typing import Any

from src.db.firebase_init import get_db

logger = logging.getLogger(__name__)

_COLLECTION = "app_config"
_DOCUMENT = "price_book"


class PriceBookRepository:
    """Firestore persistence for the master price book (app_config/price_book)."""

    # ------------------------------------------------------------------
    # READ
    # ------------------------------------------------------------------

    def get_items(self) -> list[dict[str, Any]]:
        """
        Fetch price book items from Firestore.

        Returns:
            List of item dicts, or empty list if document does not exist yet.
        """
        db = get_db()
        try:
            doc = db.collection(_COLLECTION).document(_DOCUMENT).get()
            if doc.exists:
                return (doc.to_dict() or {}).get("items", [])
            return []
        except Exception:
            logger.exception("Error reading price book from Firestore.")
            return []

    # ------------------------------------------------------------------
    # WRITE
    # ------------------------------------------------------------------

    def save_items(self, items: list[dict[str, Any]]) -> None:
        """
        Persist all items to Firestore (full replace).

        Args:
            items: Complete list of price book item dicts.
        """
        db = get_db()
        db.collection(_COLLECTION).document(_DOCUMENT).set(
            {
                "items": items,
                "updated_at": datetime.now(timezone.utc),
                "item_count": len(items),
            }
        )
        logger.info(
            "Price book saved to Firestore.",
            extra={"item_count": len(items)},
        )
