from typing import Optional, Dict, Any

class AppException(Exception):
    """Base class for all application exceptions."""
    status_code: int = 500
    error_code: str = "INTERNAL_ERROR"
    message: str = "An unexpected error occurred."
    
    def __init__(
        self, 
        message: Optional[str] = None, 
        error_code: Optional[str] = None, 
        status_code: Optional[int] = None,
        detail: Optional[Dict[str, Any]] = None
    ):
        if message:
            self.message = message
        if error_code:
            self.error_code = error_code
        if status_code:
            self.status_code = status_code
            
        super().__init__(self.message)
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


class RoomNotFoundError(ResourceNotFound):
    """Room does not exist within the given project."""
    error_code = "ROOM_NOT_FOUND"

    def __init__(self, project_id: str, room_id: str) -> None:
        super().__init__(
            message=f"Room '{room_id}' not found in project '{project_id}'.",
            detail={"project_id": project_id, "room_id": room_id},
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
    """Checkpoint operation failed (e.g. quote state save/resume in Firestore)."""
    error_code = "CHECKPOINT_ERROR"

    def __init__(self, thread_id: str, reason: str) -> None:
        super().__init__(
            message=f"Checkpoint operation failed for thread '{thread_id}': {reason}",
            detail={"thread_id": thread_id, "reason": reason},
        )


class BatchNotFoundError(ResourceNotFound):
    """Quote batch does not exist in Firestore."""
    error_code = "BATCH_NOT_FOUND"

    def __init__(self, batch_id: str) -> None:
        super().__init__(
            message=f"Quote batch '{batch_id}' not found.",
            detail={"batch_id": batch_id},
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
