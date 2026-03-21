"""
Batch Admin Service: orchestrates batch review logic in the admin tool.
"""
import logging
from datetime import datetime, timezone
import pandas as pd
from typing import Any, Literal

from src.db.batch_repo import BatchRepository
from src.services.admin_service import AdminService

logger = logging.getLogger(__name__)

class BatchAdminService:
    """Orchestrates all admin-level operations on quote batches."""
    
    def __init__(self) -> None:
        self.batch_repo = BatchRepository()
        self.admin_service = AdminService()

    def get_submitted_batches_df(self) -> pd.DataFrame:
        """Return pending batches as a display-ready DataFrame."""
        batches = self.batch_repo.get_submitted_batches()
        if not batches:
            return pd.DataFrame()
        
        rows = []
        for b in batches:
            submitted = b.get("submitted_at")
            # Ensure it's a string for reliable Streamlit rendering if it's a Timestamp
            if hasattr(submitted, "isoformat"):
                submitted = submitted.isoformat()
            
            rows.append({
                "batch_id": b.get("id"),
                "status": b.get("status", "—"),
                "total_projects": b.get("total_projects", 0),
                "batch_grand_total": b.get("batch_grand_total", 0.0),
                "potential_savings": b.get("potential_savings", 0.0),
                "user_id": b.get("user_id", "—"),
                "submitted_at": str(submitted) if submitted else "—"
            })
        return pd.DataFrame(rows)

    def get_batch_details(self, batch_id: str) -> dict[str, Any]:
        return self.batch_repo.get_batch(batch_id)

    def decide_project_in_batch(self, batch_id: str, project_id: str, decision: Literal["approve", "reject"], notes: str = "") -> None:
        """
        Admin decides on a single project in a batch.
        If approved: generates PDF & triggers webhook using AdminService.
        Regardless: updates batch progress status in Firestore.
        """
        # 1. Update quote + trigger events
        now = datetime.now(timezone.utc)
        if decision == "approve":
            self.admin_service.approve_quote(project_id, admin_notes=notes)
        else:
            self.admin_service.repo.update_quote(project_id, {
                "status": "rejected", 
                "admin_notes": notes,
                "updated_at": now
            })

        # 2. Update the batch document
        batch = self.batch_repo.get_batch(batch_id)
        if not batch:
            logger.warning("Batch not found for decision", extra={"batch_id": batch_id})
            return

        projects = batch.get("projects", [])
        new_status = "approved" if decision == "approve" else "rejected"
        
        for p in projects:
            if p.get("project_id") == project_id:
                p["status"] = new_status
                if notes:
                    p["admin_notes"] = notes
                break
        
        # Determine overall batch status
        statuses = {p.get("status") for p in projects}
        if statuses <= {"approved"}:
            batch_status = "approved"
        elif statuses <= {"rejected"}:
            batch_status = "rejected"
        elif "pending_review" in statuses or "submitted" in statuses:
            batch_status = "partially_approved"
        else:
            # Could be mixed approved/rejected but no more pending
            batch_status = "partially_approved"

        # Update the batch with the new statuses
        self.batch_repo.update_batch(batch_id, {
            "projects": projects,
            "status": batch_status,
            "updated_at": now
        })
        logger.info(f"Admin decided project in batch: {decision}", extra={"batch_id": batch_id, "project_id": project_id})
