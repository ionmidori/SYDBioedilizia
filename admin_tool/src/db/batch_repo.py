"""
Batch Repository: Firestore interactions for quote batches in the admin tool.

Skill: building-admin-dashboards
"""
import logging
from typing import Any

from google.cloud.firestore_v1.base_query import FieldFilter
from src.db.firebase_init import get_db

logger = logging.getLogger(__name__)

class BatchRepository:
    """Isolates all Firestore DB logic for quote batches."""

    def get_submitted_batches(self) -> list[dict[str, Any]]:
        """Fetch all batches in status 'submitted' or 'partially_approved'."""
        db = get_db()
        try:
            docs = (
                db.collection("quote_batches")
                .where(filter=FieldFilter("status", "in", ["submitted", "partially_approved"]))
                .stream()
            )
            batches = []
            for doc in docs:
                data = doc.to_dict() or {}
                data["id"] = doc.id
                batches.append(data)
            return sorted(batches, key=lambda x: x.get("submitted_at", ""), reverse=True)
        except Exception:
            logger.exception("Error fetching submitted batches.")
            return []

    def get_batch(self, batch_id: str) -> dict[str, Any]:
        """Fetch a specific batch document."""
        db = get_db()
        doc = db.collection("quote_batches").document(batch_id).get()
        if doc.exists:
            data = doc.to_dict() or {}
            data["id"] = doc.id
            return dict(data)
        return {}

    def update_batch(self, batch_id: str, batch_data: dict[str, Any]) -> None:
        """Merge-update a quote batch."""
        db = get_db()
        db.collection("quote_batches").document(batch_id).set(batch_data, merge=True)
        logger.info("Batch updated.", extra={"batch_id": batch_id})
