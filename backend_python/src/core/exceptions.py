from typing import Any


class AppException(Exception):
    """Base class for all application exceptions."""
    status_code: int = 500
    error_code: str = "INTERNAL_ERROR"
    message: str = "An unexpected error occurred."

    def __init__(
        self,
        message: str | None = None,
        error_code: str | None = None,
        status_code: int | None = None,
        detail: dict[str, Any] | None = None
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


class NoEligibleProjectsError(AppException):
    """Batch creation found no projects with an eligible draft quote."""
    status_code = 422
    error_code = "NO_ELIGIBLE_PROJECTS"

    def __init__(self) -> None:
        super().__init__(
            message="No eligible projects found. Each project must have a draft quote.",
        )


class BatchNotSubmittableError(AppException):
    """Attempt to submit a batch that is not in 'draft' status."""
    status_code = 409
    error_code = "BATCH_NOT_SUBMITTABLE"

    def __init__(self, batch_id: str, current_status: str) -> None:
        super().__init__(
            message=f"Batch is already '{current_status}'. Only draft batches can be submitted.",
            detail={"batch_id": batch_id, "status": current_status},
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

    def __init__(self, project_id: str, http_status: int | None = None) -> None:
        super().__init__(
            message=f"Quote delivery webhook failed for project '{project_id}'.",
            detail={"project_id": project_id, "http_status": http_status},
        )


# ─── Quote review workflow (Phase 128 — admin HITL) ───────────────────────────

class AdminRequiredError(PermissionDenied):
    """Caller is authenticated but lacks the `role=admin` custom claim (or MFA)."""
    error_code = "ADMIN_REQUIRED"

    def __init__(self, reason: str = "Admin role required.") -> None:
        super().__init__(message=reason)


class InvalidQuoteTransitionError(AppException):
    """The requested action is not allowed from the quote's current status."""
    status_code = 409
    error_code = "INVALID_TRANSITION"

    def __init__(self, current_status: str, event: str) -> None:
        super().__init__(
            message=f"Action '{event}' is not allowed when the quote is '{current_status}'.",
            detail={"status": current_status, "event": event},
        )


class QuoteVersionConflictError(AppException):
    """Optimistic-concurrency check failed: the quote changed since it was read."""
    status_code = 409
    error_code = "VERSION_CONFLICT"

    def __init__(self, project_id: str, expected_version: int, current_version: int) -> None:
        super().__init__(
            message="The quote was modified by someone else. Reload and retry.",
            detail={
                "project_id": project_id,
                "expected_version": expected_version,
                "current_version": current_version,
            },
        )


class QuoteLockedError(AppException):
    """Another admin holds the review lock on this quote."""
    status_code = 409
    error_code = "QUOTE_LOCKED"

    def __init__(self, project_id: str, locked_by: str) -> None:
        super().__init__(
            message="The quote is being reviewed by another admin.",
            detail={"project_id": project_id, "locked_by": locked_by},
        )


class PreconditionRequiredError(AppException):
    """A write that needs optimistic concurrency was sent without If-Match."""
    status_code = 428
    error_code = "PRECONDITION_REQUIRED"

    def __init__(self) -> None:
        super().__init__(message='Send the quote version in the If-Match header (e.g. "v3").')


class MediaNotFoundError(ResourceNotFound):
    """The requested media is not attached to this quote."""
    error_code = "MEDIA_NOT_FOUND"

    def __init__(self, media_id: str) -> None:
        super().__init__(message="Media not found for this quote.", detail={"media_id": media_id})
