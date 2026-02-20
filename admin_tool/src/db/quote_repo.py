"""
Quote Repository: all Firestore interactions for the admin quote workflow.

Skill: building-admin-dashboards — §Firebase Firestore Integration
Skill: error-handling-patterns — §Never Swallow Errors (QuoteNotFoundError)
"""
import logging
from typing import Any

from google.cloud.firestore_v1.base_query import FieldFilter
from src.db.firebase_init import get_db
from src.core.exceptions import QuoteNotFoundError

logger = logging.getLogger(__name__)


class QuoteRepository:
    """Isolates all Firestore DB logic for quotes and projects (Repository pattern)."""

    # ------------------------------------------------------------------
    # READ
    # ------------------------------------------------------------------

    def get_pending_quotes(self) -> list[dict[str, Any]]:
        """
        Fetch all quotes in status 'draft' or 'pending_review'.

        Uses a collection-group query on 'private_data', filtering for
        the document with id == 'quote'. Avoids In-Python scan on large docs.

        Returns:
            List of quote dicts enriched with 'project_id'.
        """
        db = get_db()
        try:
            docs = (
                db.collection_group("private_data")
                .where(filter=FieldFilter("status", "in", ["draft", "pending_review"]))
                .stream()
            )
            quotes: list[dict[str, Any]] = []
            for doc in docs:
                if doc.id != "quote":
                    continue
                data: dict[str, Any] = doc.to_dict() or {}
                parent_ref = doc.reference.parent.parent
                if parent_ref:
                    data["project_id"] = parent_ref.id
                    quotes.append(data)
            return quotes
        except Exception:
            logger.exception("Error fetching pending quotes.")
            return []

    def get_quote(self, project_id: str) -> dict[str, Any]:
        """
        Fetch a specific quote document.

        Args:
            project_id: Firestore document ID under 'projects/'.

        Returns:
            Quote dict with 'project_id' injected.

        Raises:
            QuoteNotFoundError: if the document does not exist.
        """
        db = get_db()
        try:
            ref = (
                db.collection("projects")
                .document(project_id)
                .collection("private_data")
                .document("quote")
            )
            doc = ref.get()
            if doc.exists:
                data = doc.to_dict() or {}
                data["project_id"] = project_id
                return data
            raise QuoteNotFoundError(project_id)
        except QuoteNotFoundError:
            raise
        except Exception:
            logger.exception("Error fetching quote.", extra={"project_id": project_id})
            raise QuoteNotFoundError(project_id)

    def get_project_details(self, project_id: str) -> dict[str, Any]:
        """
        Fetch complete project metadata.

        Expected fields:
            - client_email: str
            - client_name: str
            - address: str
            - name: str (internal/display)

        Args:
            project_id: Firestore document ID.

        Returns:
            Project dict or empty dict if not found.
        """
        db = get_db()
        try:
            doc = db.collection("projects").document(project_id).get()
            return doc.to_dict() if doc.exists else {}
        except Exception:
            logger.exception("Error fetching project.", extra={"project_id": project_id})
            return {}

    def get_client_info(self, project_id: str) -> dict[str, str]:
        """
        Extract client contact details from the project document.

        Reads the following fields from ``projects/{project_id}``:
            - ``client_name``  (fallback: ``name``)
            - ``client_email`` (fallback: ``email``)
            - ``address``      (no fallback — empty string if absent)

        Returns:
            Dict with 'name', 'email', and 'address' keys.
        """
        project = self.get_project_details(project_id)
        return {
            "email": project.get("client_email", project.get("email", "")),
            "name": project.get("client_name", project.get("name", "Cliente")),
            "address": project.get("address", ""),
        }

    # ------------------------------------------------------------------
    # WRITE
    # ------------------------------------------------------------------

    def update_quote(self, project_id: str, quote_data: dict[str, Any]) -> None:
        """
        Merge-update a quote document.

        Args:
            project_id: Target project.
            quote_data: Fields to update (uses Firestore merge semantics).
        """
        db = get_db()
        ref = (
            db.collection("projects")
            .document(project_id)
            .collection("private_data")
            .document("quote")
        )
        ref.set(quote_data, merge=True)
        logger.info("Quote updated.", extra={"project_id": project_id})

    def update_project(self, project_id: str, data: dict[str, Any]) -> None:
        """
        Update project metadata (e.g., client_email, address).
        """
        db = get_db()
        db.collection("projects").document(project_id).set(data, merge=True)
        logger.info("Project metadata updated.", extra={"project_id": project_id})

    def approve_quote(self, project_id: str) -> None:
        """Set quote status to 'approved'."""
        self.update_quote(project_id, {"status": "approved"})
        logger.info("Quote approved.", extra={"project_id": project_id})
