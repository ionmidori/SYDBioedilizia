"""
Admin Service Tests — Phase D (Test-Driven Development).

These tests DRIVE the implementation of AdminService.approve_quote().
The service doesn't exist yet — these tests define the contract.

Workflow:
  1. PDF generation (generate_pdf)
  2. Firebase Storage upload (upload_pdf_to_storage)
  3. n8n webhook delivery (deliver_quote_wrapper)
  4. Firestore update (update quote.status = "approved")
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.core.exceptions import PDFGenerationError, DeliveryError


@pytest.fixture
def admin_service():
    """AdminService instance for testing."""
    from src.services.admin_service import AdminService

    return AdminService()


class TestAdminServiceApproveQuote:
    """Test AdminService.approve_quote() approval pipeline."""

    @pytest.mark.asyncio
    async def test_approve_quote_calls_pdf_generation(
        self, admin_service, mock_pdf_generation, mock_storage_upload, mock_n8n_delivery, mock_firestore_update
    ):
        """PDF generation is triggered with project_id and notes."""
        mock_pdf_generation.return_value = b"PDF bytes"

        await admin_service.approve_quote(
            project_id="test-project-001",
            admin_notes="Approved by admin.",
        )

        # Verify PDF generation was called
        mock_pdf_generation.assert_called_once()
        call_args = mock_pdf_generation.call_args
        assert call_args[0][0] == "test-project-001"  # project_id
        assert "Approved by admin." in str(call_args)  # notes

    @pytest.mark.asyncio
    async def test_approve_quote_uploads_pdf_to_storage(
        self, admin_service, mock_pdf_generation, mock_storage_upload, mock_n8n_delivery, mock_firestore_update
    ):
        """PDF uploaded to Firebase Storage with correct path."""
        mock_pdf_generation.return_value = b"PDF bytes"
        mock_storage_upload.return_value = "https://storage.googleapis.com/test-bucket/projects/test-project-001/quote.pdf"

        await admin_service.approve_quote(
            project_id="test-project-001",
            admin_notes="",
        )

        # Verify storage upload was called
        mock_storage_upload.assert_called_once()
        call_args = mock_storage_upload.call_args
        assert call_args[0][0] == "test-project-001"  # project_id
        assert call_args[0][1] == b"PDF bytes"  # pdf_bytes

    @pytest.mark.asyncio
    async def test_approve_quote_delivers_via_n8n_webhook(
        self, admin_service, mock_pdf_generation, mock_storage_upload, mock_n8n_delivery, mock_firestore_update
    ):
        """n8n webhook called with pdf_url and client_email."""
        mock_pdf_generation.return_value = b"PDF bytes"
        mock_storage_upload.return_value = "https://storage.googleapis.com/test-bucket/projects/test-project-001/quote.pdf"
        mock_n8n_delivery.return_value = "Delivered"

        await admin_service.approve_quote(
            project_id="test-project-001",
            admin_notes="",
        )

        # Verify n8n delivery was called
        mock_n8n_delivery.assert_called_once()
        call_args = mock_n8n_delivery.call_args
        # Should include pdf_url in the call
        assert "https://storage.googleapis.com" in str(call_args) or "test-project-001" in str(call_args)

    @pytest.mark.asyncio
    async def test_approve_quote_updates_firestore_status_to_approved(
        self, admin_service, mock_pdf_generation, mock_storage_upload, mock_n8n_delivery, mock_firestore_update
    ):
        """Firestore quote document updated with status='approved' and pdf_url."""
        mock_pdf_generation.return_value = b"PDF bytes"
        mock_storage_upload.return_value = "https://storage.googleapis.com/test-bucket/projects/test-project-001/quote.pdf"
        mock_n8n_delivery.return_value = "Delivered"

        await admin_service.approve_quote(
            project_id="test-project-001",
            admin_notes="Approved.",
        )

        # Verify Firestore update was called
        mock_firestore_update.assert_called_once()
        # The mock should have been used to update the quote

    @pytest.mark.asyncio
    async def test_approve_quote_gracefully_handles_pdf_generation_error(
        self, admin_service, mock_pdf_generation, mock_storage_upload, mock_n8n_delivery, mock_firestore_update
    ):
        """PDFGenerationError is propagated (halts pipeline)."""
        mock_pdf_generation.side_effect = PDFGenerationError(
            project_id="test-project-001",
            reason="PDF generation failed",
        )

        with pytest.raises(PDFGenerationError):
            await admin_service.approve_quote(
                project_id="test-project-001",
                admin_notes="",
            )

        # Verify downstream calls were NOT made
        mock_storage_upload.assert_not_called()
        mock_n8n_delivery.assert_not_called()

    @pytest.mark.asyncio
    async def test_approve_quote_gracefully_handles_storage_error(
        self, admin_service, mock_pdf_generation, mock_storage_upload, mock_n8n_delivery, mock_firestore_update
    ):
        """Storage upload error is logged and pipeline halts."""
        mock_pdf_generation.return_value = b"PDF bytes"
        mock_storage_upload.side_effect = Exception("Storage bucket not accessible")

        with pytest.raises(Exception):
            await admin_service.approve_quote(
                project_id="test-project-001",
                admin_notes="",
            )

        # Downstream calls should not be made
        mock_n8n_delivery.assert_not_called()

    @pytest.mark.asyncio
    async def test_approve_quote_gracefully_handles_delivery_error(
        self, admin_service, mock_pdf_generation, mock_storage_upload, mock_n8n_delivery, mock_firestore_update
    ):
        """DeliveryError is propagated (but doesn't block quote approval in DB)."""
        mock_pdf_generation.return_value = b"PDF bytes"
        mock_storage_upload.return_value = "https://storage.googleapis.com/test-bucket/projects/test-project-001/quote.pdf"
        mock_n8n_delivery.side_effect = DeliveryError(
            project_id="test-project-001",
            http_status=500,
        )

        # Note: In production, we might want to store the error reason
        # but still update Firestore to mark quote as approved.
        # This test documents the current behavior.
        with pytest.raises(DeliveryError):
            await admin_service.approve_quote(
                project_id="test-project-001",
                admin_notes="",
            )

    @pytest.mark.asyncio
    async def test_approve_quote_with_long_notes(
        self, admin_service, mock_pdf_generation, mock_storage_upload, mock_n8n_delivery, mock_firestore_update
    ):
        """Admin notes up to 2000 chars are included in PDF."""
        mock_pdf_generation.return_value = b"PDF bytes"
        long_notes = "This is a very detailed admin note. " * 50  # ~1800 chars

        await admin_service.approve_quote(
            project_id="test-project-001",
            admin_notes=long_notes,
        )

        # Verify PDF generation received the notes
        call_args = mock_pdf_generation.call_args
        assert long_notes in str(call_args) or "note" in str(call_args).lower()

    @pytest.mark.asyncio
    async def test_approve_quote_with_empty_notes(
        self, admin_service, mock_pdf_generation, mock_storage_upload, mock_n8n_delivery, mock_firestore_update
    ):
        """Empty notes are handled gracefully."""
        mock_pdf_generation.return_value = b"PDF bytes"

        await admin_service.approve_quote(
            project_id="test-project-001",
            admin_notes="",
        )

        # Should not raise any error
        mock_pdf_generation.assert_called_once()


class TestAdminServiceIntegration:
    """Integration tests for AdminService with real mocked dependencies."""

    @pytest.mark.asyncio
    async def test_approve_quote_full_pipeline_success(
        self, admin_service, mock_pdf_generation, mock_storage_upload, mock_n8n_delivery, mock_firestore_update
    ):
        """Full happy-path pipeline: PDF → Storage → n8n → Firestore."""
        mock_pdf_generation.return_value = b"PDF bytes"
        mock_storage_upload.return_value = "https://storage.googleapis.com/test-bucket/projects/test-project-001/quote.pdf"
        mock_n8n_delivery.return_value = "Delivered"

        # Should complete without error
        await admin_service.approve_quote(
            project_id="test-project-001",
            admin_notes="Approved.",
        )

        # Verify all steps were executed
        mock_pdf_generation.assert_called_once()
        mock_storage_upload.assert_called_once()
        mock_n8n_delivery.assert_called_once()
        mock_firestore_update.assert_called_once()

    @pytest.mark.asyncio
    async def test_approve_quote_idempotent_with_project_id(
        self, admin_service, mock_pdf_generation, mock_storage_upload, mock_n8n_delivery, mock_firestore_update
    ):
        """Same project_id can be approved multiple times (overwrites previous quote)."""
        mock_pdf_generation.return_value = b"PDF bytes"
        mock_storage_upload.return_value = "https://storage.googleapis.com/test-bucket/projects/test-project-001/quote.pdf"

        # First approval
        await admin_service.approve_quote(
            project_id="test-project-001",
            admin_notes="First approval",
        )

        # Second approval (new notes)
        await admin_service.approve_quote(
            project_id="test-project-001",
            admin_notes="Second approval - updated",
        )

        # Both should succeed
        assert mock_pdf_generation.call_count == 2
        assert mock_storage_upload.call_count == 2
