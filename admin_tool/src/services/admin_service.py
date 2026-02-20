"""
Admin Service: orchestrates the quote approval pipeline.

Skill: building-admin-dashboards — §Approval actions
Skill: generating-pdf-documents — §FastAPI Route Pattern (run_in_threadpool)
"""
import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import pandas as pd

from src.db.quote_repo import QuoteRepository
from src.services.pdf_service import PdfService
from src.services.delivery_service import DeliveryService

logger = logging.getLogger(__name__)

# Dedicated thread pool so PDF generation never competes with other blocking work
_PDF_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="pdf_worker")


class AdminService:
    """
    Orchestrates all admin-level operations on quotes.

    Enforced separations:
    - DB logic → QuoteRepository
    - PDF logic → PdfService (CPU-bound, runs in thread pool)
    - Delivery logic → DeliveryService (async httpx)
    """

    def __init__(self) -> None:
        self.repo = QuoteRepository()
        self.pdf_service = PdfService()
        self.delivery_service = DeliveryService()

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

    def get_quote_details(self, project_id: str) -> dict[str, Any]:
        """Full quote data for the review page."""
        return self.repo.get_quote(project_id)

    def get_project_info(self, project_id: str) -> dict[str, Any]:
        """Project metadata (address, client name, etc.) for context display."""
        return self.repo.get_project_details(project_id)

    # ------------------------------------------------------------------
    # WRITE
    # ------------------------------------------------------------------

    def update_quote_items(
        self, project_id: str, new_items: list[dict[str, Any]]
    ) -> None:
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

    def approve_quote(self, project_id: str, admin_notes: str = "") -> None:
        """
        Full approval pipeline: PDF generation → Storage upload → n8n delivery → DB update.

        PDF is generated synchronously in a thread pool (CPU-bound).
        Delivery webhook is called via asyncio.run() since Streamlit is synchronous.

        Args:
            project_id: Target project.
            admin_notes: Optional admin comments saved to the quote.
        """
        # 1. Fetch latest quote data
        quote_data = self.repo.get_quote(project_id)
        if not quote_data:
            raise ValueError(f"Quote not found for project: {project_id}")

        # 2. Add admin notes before generating PDF
        if admin_notes:
            quote_data["admin_notes"] = admin_notes

        # 3. Generate PDF in thread pool (CPU-bound — skill: generating-pdf-documents)
        logger.info("Generating PDF...", extra={"project_id": project_id})
        loop = asyncio.new_event_loop()
        try:
            pdf_url: str = loop.run_in_executor(
                _PDF_EXECUTOR,
                self.pdf_service.generate_and_deliver,
                quote_data,
            )
            pdf_url = loop.run_until_complete(pdf_url)
        finally:
            loop.close()

        # 4. Fetch real client info from project document (not hardcoded!)
        client_data = self.repo.get_client_info(project_id)
        grand_total: float = quote_data.get("financials", {}).get("grand_total", 0.0)

        # 5. Trigger n8n webhook (async HTTP, skill: n8n-mcp-integration)
        logger.info("Triggering n8n delivery...", extra={"project_id": project_id})
        loop2 = asyncio.new_event_loop()
        try:
            loop2.run_until_complete(
                self.delivery_service.deliver_quote(
                    project_id, pdf_url, client_data, grand_total
                )
            )
        finally:
            loop2.close()

        # 6. Update DB status + notes
        self.repo.update_quote(
            project_id,
            {"status": "approved", "admin_notes": admin_notes, "pdf_url": pdf_url},
        )
        logger.info("Quote approved and delivered.", extra={"project_id": project_id})
