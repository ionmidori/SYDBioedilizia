"""
Admin Service: orchestrates the quote approval pipeline.

Approve/reject delegate to the backend's unified pipeline
(POST /internal/quote/approve — same code path as the client-facing
POST /api/quote/{id}/approve): PDF generation, Storage upload, pdf_blob_path,
and client email delivery all happen server-side. This console used to run
its own separate pipeline (PdfService + DeliveryService, removed in this
change) that silently fell back to a fake pdf_url on upload failure and never
persisted pdf_blob_path — the client's "Preventivi" PDF download 404'd as a
result. See Phase 96 smoke findings.

Skill: building-admin-dashboards — §Approval actions
"""
import logging
import os

import httpx
import pandas as pd

from src.core.exceptions import QuoteApprovalError
from src.db.quote_repo import QuoteRepository

logger = logging.getLogger(__name__)

_TIMEOUT = 60.0  # PDF generation + SMTP send can take a few seconds


class AdminService:
    """
    Orchestrates all admin-level operations on quotes.

    Enforced separations:
    - DB logic (read-only display, item edits) → QuoteRepository
    - Approve/reject side effects (PDF + email) → backend, via
      POST /internal/quote/approve (this class is a thin HTTP client for it)
    """

    def __init__(self) -> None:
        self.repo = QuoteRepository()
        self._backend_url = os.getenv("BACKEND_URL", "http://localhost:8080").rstrip("/")
        self._internal_secret = os.getenv("ADMIN_INTERNAL_SECRET", "")

    # ------------------------------------------------------------------
    # READ
    # ------------------------------------------------------------------

    def get_pending_quotes_df(self) -> pd.DataFrame:
        """
        Return pending quotes as a display-ready DataFrame.

        Returns:
            DataFrame with columns: project_id, status, total_amount,
            items_count, client_name, created_at.
        """
        quotes = self.repo.get_pending_quotes()
        if not quotes:
            return pd.DataFrame()

        rows = []
        for q in quotes:
            rows.append(
                {
                    "project_id": q.get("project_id", "—"),
                    "status": q.get("status", "—"),
                    "client_name": q.get("client_name", "—"),
                    "total_amount": q.get("financials", {}).get("grand_total", 0.0),
                    "items_count": len(q.get("items", [])),
                    "created_at": q.get("created_at"),
                }
            )
        return pd.DataFrame(rows)

    def get_quote_details(self, project_id: str) -> dict:
        """Full quote data for the review page."""
        return self.repo.get_quote(project_id)

    def get_project_info(self, project_id: str) -> dict:
        """Project metadata (address, client name, etc.) for context display."""
        return self.repo.get_project_details(project_id)

    # ------------------------------------------------------------------
    # WRITE
    # ------------------------------------------------------------------

    def update_quote_items(self, project_id: str, new_items: list[dict]) -> None:
        """
        Persist edited items and recalculate financials.

        Args:
            project_id: Target project.
            new_items: List of item dicts from the data editor.
        """
        subtotal = round(sum(item.get("total", 0.0) for item in new_items), 2)
        vat_rate = 0.22
        vat_amount = round(subtotal * vat_rate, 2)
        grand_total = round(subtotal + vat_amount, 2)

        self.repo.update_quote(
            project_id,
            {
                "items": new_items,
                "financials": {
                    "subtotal": subtotal,
                    "vat_rate": vat_rate,
                    "vat_amount": vat_amount,
                    "grand_total": grand_total,
                },
            },
        )

    def _call_internal_approve(
        self, project_id: str, decision: str, notes: str, reviewed_by: str
    ) -> None:
        """
        POST /internal/quote/approve — shared secret auth, no Firebase user.
        Raises QuoteApprovalError on any failure (config, auth, HTTP, network).
        Never silently succeeds.
        """
        if not self._internal_secret:
            raise QuoteApprovalError(
                "ADMIN_INTERNAL_SECRET non configurato nel file .env dell'admin tool."
            )

        try:
            response = httpx.post(
                f"{self._backend_url}/internal/quote/approve",
                json={
                    "project_id": project_id,
                    "decision": decision,
                    "notes": notes,
                    "reviewed_by": reviewed_by or "admin-console",
                },
                headers={"X-Admin-Internal-Secret": self._internal_secret},
                timeout=_TIMEOUT,
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Quote %s failed.",
                decision,
                extra={
                    "project_id": project_id,
                    "status_code": exc.response.status_code,
                    "body": exc.response.text,
                },
            )
            raise QuoteApprovalError(
                f"Il backend ha rifiutato la richiesta ({exc.response.status_code}): "
                f"{exc.response.text}"
            ) from exc
        except httpx.RequestError as exc:
            logger.error(
                "Quote %s request error.", decision, extra={"project_id": project_id}
            )
            raise QuoteApprovalError(
                f"Impossibile contattare il backend ({self._backend_url}): {exc}"
            ) from exc

        logger.info(
            "Quote %sd via backend pipeline.", decision, extra={"project_id": project_id}
        )

    def approve_quote(
        self, project_id: str, admin_notes: str = "", reviewed_by: str = "admin-console"
    ) -> None:
        """
        Approve a quote: triggers PDF generation + client email delivery
        server-side. Raises QuoteApprovalError on failure — never a silent
        success (see module docstring).
        """
        self._call_internal_approve(project_id, "approve", admin_notes, reviewed_by)

    def reject_quote(
        self, project_id: str, admin_notes: str = "", reviewed_by: str = "admin-console"
    ) -> None:
        """Reject a quote: status update only, no PDF/email."""
        self._call_internal_approve(project_id, "reject", admin_notes, reviewed_by)
