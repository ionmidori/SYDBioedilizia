"""
Unit tests for the custom exception hierarchy.

Skill: error-handling-patterns — verify structure, error_code, and inheritance.
Rule: Every new Service/Exception set MUST have a test_ counterpart (rule #20).
"""
import pytest
from src.core.exceptions import (
    AppException,
    QuoteNotFoundError,
    QuoteAlreadyApprovedError,
    CheckpointError,
    PDFGenerationError,
    PDFUploadError,
    DeliveryError,
    ResourceNotFound,
    ServiceError,
)


# ─── Inheritance ──────────────────────────────────────────────────────────────

class TestInheritanceHierarchy:
    def test_quote_not_found_is_resource_not_found(self):
        assert issubclass(QuoteNotFoundError, ResourceNotFound)

    def test_resource_not_found_is_app_exception(self):
        assert issubclass(ResourceNotFound, AppException)

    def test_checkpoint_is_service_error(self):
        assert issubclass(CheckpointError, ServiceError)

    def test_pdf_generation_is_service_error(self):
        assert issubclass(PDFGenerationError, ServiceError)

    def test_pdf_upload_is_service_error(self):
        assert issubclass(PDFUploadError, ServiceError)

    def test_delivery_is_service_error(self):
        assert issubclass(DeliveryError, ServiceError)

    def test_quote_already_approved_is_app_exception(self):
        assert issubclass(QuoteAlreadyApprovedError, AppException)


# ─── Error codes ──────────────────────────────────────────────────────────────

class TestErrorCodes:
    def test_quote_not_found_error_code(self):
        exc = QuoteNotFoundError("proj-123")
        assert exc.error_code == "QUOTE_NOT_FOUND"
        assert "proj-123" in str(exc)

    def test_quote_already_approved_error_code(self):
        exc = QuoteAlreadyApprovedError("proj-456")
        assert exc.error_code == "QUOTE_ALREADY_APPROVED"
        assert exc.status_code == 409

    def test_checkpoint_error_code(self):
        exc = CheckpointError("thread-1", "Firestore write failed")
        assert exc.error_code == "CHECKPOINT_ERROR"
        assert exc.detail["thread_id"] == "thread-1"
        assert exc.detail["reason"] == "Firestore write failed"

    def test_pdf_generation_error_code(self):
        exc = PDFGenerationError("proj-789", "Jinja2 template not found")
        assert exc.error_code == "PDF_GENERATION_ERROR"
        assert exc.detail["project_id"] == "proj-789"

    def test_pdf_upload_error_code(self):
        exc = PDFUploadError("proj-789", "Storage bucket not configured")
        assert exc.error_code == "PDF_UPLOAD_ERROR"

    def test_delivery_error_code_with_status(self):
        exc = DeliveryError("proj-000", http_status=503)
        assert exc.error_code == "DELIVERY_ERROR"
        assert exc.detail["http_status"] == 503

    def test_delivery_error_code_without_status(self):
        exc = DeliveryError("proj-000")
        assert exc.detail["http_status"] is None


# ─── detail is never None ─────────────────────────────────────────────────────

class TestDetailNeverNone:
    """Skill: error-handling-patterns — details must be {} not None."""

    def test_base_app_exception_detail_defaults_to_empty_dict(self):
        # AppException(message, detail=None) — detail arg is optional dict, not error_code
        exc = AppException("generic error")
        assert exc.detail == {}

    def test_quote_not_found_detail_has_project_id(self):
        exc = QuoteNotFoundError("proj-abc")
        assert exc.detail.get("project_id") == "proj-abc"

    def test_all_exceptions_catchable_as_app_exception(self):
        """Verify the hierarchy: all domain errors caught as AppException."""
        errors = [
            QuoteNotFoundError("p"),
            QuoteAlreadyApprovedError("p"),
            CheckpointError("t", "r"),
            PDFGenerationError("p", "r"),
            PDFUploadError("p", "r"),
            DeliveryError("p"),
        ]
        for err in errors:
            assert isinstance(err, AppException), f"{type(err).__name__} not AppException"
