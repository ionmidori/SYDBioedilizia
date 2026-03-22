"""
Testimonial Repository: all Firestore operations for the testimonial moderation workflow.

Skill: building-admin-dashboards — §Firebase Firestore Integration
Skill: error-handling-patterns — §Never Swallow Errors
"""
import logging
from typing import Any

from google.cloud.firestore_v1.base_query import FieldFilter
from src.db.firebase_init import get_db

logger = logging.getLogger(__name__)


class TestimonialRepository:
    """Isolates all Firestore DB logic for the testimonials collection."""

    COLLECTION = "testimonials"

    # ------------------------------------------------------------------
    # READ
    # ------------------------------------------------------------------

    def get_by_status(self, status: str) -> list[dict[str, Any]]:
        """
        Fetch testimonials filtered by status.

        Args:
            status: 'pending', 'approved', or 'rejected'.

        Returns:
            List of testimonial dicts with 'id' injected.
        """
        db = get_db()
        try:
            docs = (
                db.collection(self.COLLECTION)
                .where(filter=FieldFilter("status", "==", status))
                .stream()
            )
            items: list[dict[str, Any]] = []
            for doc in docs:
                data: dict[str, Any] = doc.to_dict() or {}
                data["id"] = doc.id
                items.append(data)
            return items
        except Exception:
            logger.exception("Error fetching testimonials.", extra={"status": status})
            return []

    def get_stats(self) -> dict[str, int]:
        """
        Return counts per status without loading full documents.

        Returns:
            Dict with keys 'pending', 'approved', 'rejected'.
        """
        db = get_db()
        counts: dict[str, int] = {"pending": 0, "approved": 0, "rejected": 0}
        try:
            for doc in db.collection(self.COLLECTION).stream():
                s = (doc.to_dict() or {}).get("status", "")
                if s in counts:
                    counts[s] += 1
        except Exception:
            logger.exception("Error fetching testimonial stats.")
        return counts

    # ------------------------------------------------------------------
    # WRITE
    # ------------------------------------------------------------------

    def update_status(
        self, testimonial_id: str, status: str, admin_notes: str = ""
    ) -> None:
        """
        Set the status of a testimonial document.

        Args:
            testimonial_id: Firestore document ID.
            status: 'approved' or 'rejected'.
            admin_notes: Optional notes stored for audit trail.
        """
        db = get_db()
        update: dict[str, Any] = {"status": status}
        if admin_notes:
            update["admin_notes"] = admin_notes
        db.collection(self.COLLECTION).document(testimonial_id).update(update)
        logger.info(
            "Testimonial status updated.",
            extra={"testimonial_id": testimonial_id, "status": status},
        )
