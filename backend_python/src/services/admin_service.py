"""
Admin Service — HITL Quote Approval Pipeline (Phase D Implementation).

Implements AdminService.approve_quote() which:
  1. Generates PDF from project data + admin notes
  2. Uploads PDF to Firebase Storage
  3. Delivers via n8n webhook (with retry logic)
  4. Updates Firestore quote document with status='approved' and pdf_url

Driven by test_admin_service.py (TDD approach).
"""
import logging
from typing import Any

from src.core.exceptions import PDFGenerationError, DeliveryError

logger = logging.getLogger(__name__)


class AdminService:
    """
    Handles the full approval pipeline for HITL quotes.

    Usage:
        service = AdminService()
        await service.approve_quote(
            project_id="proj-123",
            admin_notes="Approved by admin.",
        )
    """

    async def approve_quote(self, project_id: str, admin_notes: str = "") -> None:
        """
        Complete approval pipeline:
          1. Generate PDF from quote data
          2. Upload to Firebase Storage
          3. Deliver via n8n webhook
          4. Update Firestore

        Args:
            project_id: Firestore document ID
            admin_notes: Optional admin notes (max 2000 chars)

        Raises:
            PDFGenerationError: PDF generation failed (halts pipeline)
            DeliveryError: n8n delivery failed (may or may not update DB)
        """
        logger.info(
            "Starting quote approval pipeline.",
            extra={"project_id": project_id, "notes_len": len(admin_notes)},
        )

        # Step 1: Generate PDF
        try:
            pdf_bytes = await self._generate_pdf(project_id, admin_notes)
            logger.info("PDF generated successfully.", extra={"project_id": project_id})
        except Exception as exc:
            logger.error("PDF generation failed.", extra={"project_id": project_id})
            raise PDFGenerationError(
                project_id=project_id,
                reason=str(exc),
            ) from exc

        # Step 2: Upload to Firebase Storage
        try:
            pdf_url = await self._upload_pdf_to_storage(project_id, pdf_bytes)
            logger.info(
                "PDF uploaded to Storage.",
                extra={"project_id": project_id, "url": pdf_url[:50] + "..."},
            )
        except Exception as exc:
            logger.error("Storage upload failed.", extra={"project_id": project_id})
            raise

        # Step 3: Deliver via n8n webhook
        try:
            await self._deliver_quote(project_id, pdf_url, admin_notes)
            logger.info("n8n delivery triggered.", extra={"project_id": project_id})
        except DeliveryError:
            # Re-raise delivery errors, but we may still have updated Firestore
            logger.warning("n8n delivery failed, but proceeding.", extra={"project_id": project_id})
            raise

        # Step 4: Update Firestore
        try:
            await self._update_firestore(project_id, pdf_url, admin_notes)
            logger.info("Firestore updated.", extra={"project_id": project_id})
        except Exception as exc:
            logger.error("Firestore update failed.", extra={"project_id": project_id})
            raise

        logger.info("Quote approval pipeline complete.", extra={"project_id": project_id})

    # ─── Private Methods ──────────────────────────────────────────────────────

    async def _generate_pdf(self, project_id: str, admin_notes: str) -> bytes:
        """
        Generate PDF from quote data.

        TODO: Implement with actual PDF generation library (e.g., reportlab).
              For now, this is a placeholder.
        """
        from src.services.admin_service import generate_pdf

        return await generate_pdf(project_id, admin_notes)

    async def _upload_pdf_to_storage(self, project_id: str, pdf_bytes: bytes) -> str:
        """
        Upload PDF to Firebase Storage and return signed URL.

        Returns: Signed Firebase Storage URL (valid 1 hour)
        """
        from src.services.admin_service import upload_pdf_to_storage

        return await upload_pdf_to_storage(project_id, pdf_bytes)

    async def _deliver_quote(self, project_id: str, pdf_url: str, admin_notes: str) -> None:
        """
        Trigger n8n webhook to deliver quote to client.

        Raises: DeliveryError if all retries exhausted
        """
        from src.services.admin_service import deliver_quote_wrapper

        await deliver_quote_wrapper(
            project_id=project_id,
            pdf_url=pdf_url,
            admin_notes=admin_notes,
        )

    async def _update_firestore(self, project_id: str, pdf_url: str, admin_notes: str) -> None:
        """
        Update Firestore quote document with approval status and pdf_url.

        Path: projects/{project_id}/quotes/{quote_id}
        Updates:
          - status: "approved"
          - pdf_url: signed Storage URL
          - admin_notes: admin's approval notes
          - approved_at: current timestamp
        """
        from src.services.admin_service import get_async_firestore_client

        db = await get_async_firestore_client()

        # TODO: Get actual quote_id from project metadata
        # For now, assume quote_id = project_id or similar
        quote_ref = db.collection("projects").document(project_id).collection("quotes").document("current")

        await quote_ref.update({
            "status": "approved",
            "pdf_url": pdf_url,
            "admin_notes": admin_notes,
            "approved_at": __import__("datetime").datetime.utcnow(),
        })


# ─── Utility Functions (to be implemented) ───────────────────────────────────

async def generate_pdf(project_id: str, admin_notes: str) -> bytes:
    """
    Generate PDF from quote data and admin notes.

    TODO: Implement with reportlab or similar.
    For now, placeholder.
    """
    # Placeholder: would use reportlab or similar
    return b"PDF content placeholder"


async def upload_pdf_to_storage(project_id: str, pdf_bytes: bytes) -> str:
    """
    Upload PDF to Firebase Storage and return signed URL.

    Path: projects/{project_id}/quote.pdf
    Returns: Signed URL valid for 1 hour
    """
    from firebase_admin import storage
    import time

    bucket = storage.bucket()
    blob = bucket.blob(f"projects/{project_id}/quote.pdf")

    # Upload bytes
    blob.upload_from_string(
        pdf_bytes,
        content_type="application/pdf",
    )

    # Generate signed URL (1 hour)
    signed_url = blob.generate_signed_url(
        expiration=3600,  # 1 hour
        method="GET",
    )

    return signed_url


async def deliver_quote_wrapper(
    project_id: str,
    pdf_url: str,
    admin_notes: str,
) -> None:
    """
    Wrapper around n8n delivery with retry logic.

    Uses n8n webhook to notify client of quote delivery.
    Implements exponential backoff: 3 retries max.

    Raises: DeliveryError if all retries exhausted
    """
    from src.tools.n8n_mcp_tools import deliver_quote_wrapper as n8n_deliver

    # Delegate to n8n tools (which handles retry logic)
    await n8n_deliver(
        project_id=project_id,
        pdf_url=pdf_url,
        admin_notes=admin_notes,
    )


async def get_async_firestore_client():
    """
    Get async Firestore client.

    TODO: Implement with async Firestore wrapper.
    For now, placeholder returning mock.
    """
    from firebase_admin import firestore_async

    return firestore_async.client()
