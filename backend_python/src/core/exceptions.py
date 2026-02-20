from typing import Optional, Dict, Any

class AppException(Exception):
    """Base class for all application exceptions."""
    status_code: int = 500
    error_code: str = "INTERNAL_ERROR"
    
    def __init__(self, message: str, detail: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.message = message
        self.detail = detail or {}

class ResourceNotFound(AppException):
    status_code = 404
    error_code = "RESOURCE_NOT_FOUND"

class AuthError(AppException):
    status_code = 401
    error_code = "AUTH_ERROR"

class PermissionDenied(AppException):
    status_code = 403
    error_code = "PERMISSION_DENIED"

class AppCheckError(AppException):
    status_code = 403
    error_code = "APP_CHECK_FAILED"

class ServiceError(AppException):
    """Exceptions related to external services (AI, DB, etc.)"""
    status_code = 502
    error_code = "SERVICE_ERROR"
    
class AIServiceError(ServiceError):
    error_code = "AI_GENERATION_FAILED"

class QuotaExceeded(AppException):
    status_code = 429
    error_code = "QUOTA_EXCEEDED"


# ─── Quote / HITL Domain (skill: error-handling-patterns) ─────────────────────

class QuoteNotFoundError(ResourceNotFound):
    """Quote document does not exist in Firestore for the given project."""
    error_code = "QUOTE_NOT_FOUND"

    def __init__(self, project_id: str) -> None:
        super().__init__(
            message=f"Quote not found for project '{project_id}'.",
            detail={"project_id": project_id},
        )


class QuoteAlreadyApprovedError(AppException):
    """Attempt to approve an already-approved quote (idempotency guard)."""
    status_code = 409
    error_code = "QUOTE_ALREADY_APPROVED"

    def __init__(self, project_id: str) -> None:
        super().__init__(
            message=f"Quote for project '{project_id}' is already approved.",
            detail={"project_id": project_id},
        )


class CheckpointError(ServiceError):
    """LangGraph checkpoint cannot be saved or resumed (FirestoreSaver)."""
    error_code = "CHECKPOINT_ERROR"

    def __init__(self, thread_id: str, reason: str) -> None:
        super().__init__(
            message=f"Checkpoint operation failed for thread '{thread_id}': {reason}",
            detail={"thread_id": thread_id, "reason": reason},
        )


class PDFGenerationError(ServiceError):
    """WeasyPrint/Jinja2 rendering failed (CPU-bound, run_in_threadpool)."""
    error_code = "PDF_GENERATION_ERROR"

    def __init__(self, project_id: str, reason: str) -> None:
        super().__init__(
            message=f"PDF generation failed for project '{project_id}': {reason}",
            detail={"project_id": project_id, "reason": reason},
        )


class PDFUploadError(ServiceError):
    """Firebase Storage upload of the generated PDF failed."""
    error_code = "PDF_UPLOAD_ERROR"

    def __init__(self, project_id: str, reason: str) -> None:
        super().__init__(
            message=f"PDF upload failed for project '{project_id}': {reason}",
            detail={"project_id": project_id, "reason": reason},
        )


class DeliveryError(ServiceError):
    """All tenacity retry attempts to the n8n webhook were exhausted."""
    error_code = "DELIVERY_ERROR"

    def __init__(self, project_id: str, http_status: Optional[int] = None) -> None:
        super().__init__(
            message=f"Quote delivery webhook failed for project '{project_id}'.",
            detail={"project_id": project_id, "http_status": http_status},
        )
