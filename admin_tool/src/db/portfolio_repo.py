"""
Portfolio Repository: Firestore CRUD for the portfolio_projects collection.

Skill: building-admin-dashboards — §Firebase Firestore Integration
"""
import logging
from datetime import datetime, timezone
from typing import Any

from google.cloud.firestore_v1.base_query import FieldFilter
from src.db.firebase_init import get_db

logger = logging.getLogger(__name__)

COLLECTION = "portfolio_projects"


class PortfolioRepository:
    """Isolates all Firestore operations for portfolio projects."""

    # ------------------------------------------------------------------
    # READ
    # ------------------------------------------------------------------

    def get_all(self) -> list[dict[str, Any]]:
        """
        Return all portfolio projects ordered by 'order' field.

        Returns:
            List of project dicts with 'id' injected.
        """
        db = get_db()
        try:
            docs = db.collection(COLLECTION).order_by("order").stream()
            items: list[dict[str, Any]] = []
            for doc in docs:
                data: dict[str, Any] = doc.to_dict() or {}
                data["id"] = doc.id
                items.append(data)
            return items
        except Exception:
            logger.exception("Error fetching portfolio projects.")
            return []

    def get_by_id(self, project_id: str) -> dict[str, Any] | None:
        db = get_db()
        try:
            doc = db.collection(COLLECTION).document(project_id).get()
            if doc.exists:
                data = doc.to_dict() or {}
                data["id"] = doc.id
                return data
            return None
        except Exception:
            logger.exception("Error fetching portfolio project.", extra={"id": project_id})
            return None

    # ------------------------------------------------------------------
    # WRITE
    # ------------------------------------------------------------------

    def create(self, data: dict[str, Any]) -> str:
        """
        Create a new portfolio project.

        Returns:
            New Firestore document ID.
        """
        db = get_db()
        now = datetime.now(timezone.utc)
        data["created_at"] = now
        data["updated_at"] = now
        data.setdefault("active", True)
        _, ref = db.collection(COLLECTION).add(data)
        logger.info("Portfolio project created.", extra={"id": ref.id})
        return ref.id

    def update(self, project_id: str, data: dict[str, Any]) -> None:
        """Merge-update an existing portfolio project."""
        db = get_db()
        data["updated_at"] = datetime.now(timezone.utc)
        db.collection(COLLECTION).document(project_id).set(data, merge=True)
        logger.info("Portfolio project updated.", extra={"id": project_id})

    def delete(self, project_id: str) -> None:
        """Permanently delete a portfolio project."""
        db = get_db()
        db.collection(COLLECTION).document(project_id).delete()
        logger.info("Portfolio project deleted.", extra={"id": project_id})

    def set_active(self, project_id: str, active: bool) -> None:
        """Toggle project visibility on the landing page."""
        self.update(project_id, {"active": active})

    def count(self) -> int:
        """Return total number of projects (for default order assignment)."""
        db = get_db()
        try:
            return sum(1 for _ in db.collection(COLLECTION).stream())
        except Exception:
            return 0
