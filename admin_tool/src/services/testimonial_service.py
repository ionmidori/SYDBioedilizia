"""
Testimonial Service: orchestrates the testimonial moderation pipeline.

Skill: building-admin-dashboards — §Testimonial Moderation
"""
import logging
from typing import Any

import pandas as pd

from src.db.testimonial_repo import TestimonialRepository

logger = logging.getLogger(__name__)


class TestimonialService:
    """Orchestrates all admin-level operations on testimonials."""

    def __init__(self) -> None:
        self.repo = TestimonialRepository()

    # ------------------------------------------------------------------
    # READ
    # ------------------------------------------------------------------

    def get_pending_df(self) -> pd.DataFrame:
        """
        Return pending testimonials as a display-ready DataFrame.

        Returns:
            DataFrame with columns: id, name, rating, text, created_at.
        """
        items = self.repo.get_by_status("pending")
        if not items:
            return pd.DataFrame()
        rows = [
            {
                "id": t.get("id", ""),
                "name": t.get("name", "—"),
                "rating": int(t.get("rating", 0)),
                "text": t.get("text", ""),
                "created_at": t.get("createdAt"),
            }
            for t in items
        ]
        return pd.DataFrame(rows)

    def get_stats(self) -> dict[str, int]:
        """Return aggregate counts per status (pending/approved/rejected)."""
        return self.repo.get_stats()

    # ------------------------------------------------------------------
    # WRITE
    # ------------------------------------------------------------------

    def approve(self, testimonial_id: str, admin_notes: str = "") -> None:
        """Approve a testimonial — publishes it on the landing page."""
        self.repo.update_status(testimonial_id, "approved", admin_notes)
        logger.info("Testimonial approved.", extra={"testimonial_id": testimonial_id})

    def reject(self, testimonial_id: str, admin_notes: str = "") -> None:
        """Reject a testimonial — permanently hides it from the landing page."""
        self.repo.update_status(testimonial_id, "rejected", admin_notes)
        logger.info("Testimonial rejected.", extra={"testimonial_id": testimonial_id})
