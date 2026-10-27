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


# ─── GDPR erasure (src/services/erasure) ──────────────────────────────────────

class ErasureInProgressError(AppException):
    """Another run is erasing this user right now (double request, scheduler)."""
    status_code = 409
    error_code = "GDPR_ERASURE_IN_PROGRESS"

    def __init__(self) -> None:
        super().__init__(message="La cancellazione dell'account è già in corso.")


class ErasureIncompleteError(AppException):
    """The erasure started (the account is disabled) but a step failed: the
    scheduled job resumes it. Not a final failure, hence 503."""
    status_code = 503
    error_code = "GDPR_ERASURE_PENDING"

    def __init__(self) -> None:
        super().__init__(
            message="La cancellazione dell'account è stata avviata e verrà completata automaticamente."
        )


# ─── Quote / HITL Domain (skill: error-handling-patterns) ─────────────────────

class QuoteNotFoundError(ResourceNotFound):
    """Quote document does not exist in Firestore for the given project."""
    error_code = "QUOTE_NOT_FOUND"

    def __init__(self, project_id: str) -> None:
        super().__init__(
            message=f"Quote not found for project '{project_id}'.",
            detail={"project_id": project_id},
        )


class EmptyQuoteError(AppException):
    """The client tried to submit a quote draft without any item."""
    status_code = 422
    error_code = "QUOTE_EMPTY"

    def __init__(self, project_id: str) -> None:
        super().__init__(
            message="The quote has no items yet: complete it in the chat before sending it.",
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


class RoomLimitError(AppException):
    """The project already has the maximum number of rooms."""
    status_code = 409
    error_code = "ROOM_LIMIT_REACHED"

    def __init__(self, project_id: str, limit: int) -> None:
        super().__init__(
            message=f"Project '{project_id}' already has {limit} rooms.",
            detail={"project_id": project_id, "limit": limit},
        )


class ProjectFileNotFoundError(ResourceNotFound):
    """File does not exist within the given project."""
    error_code = "FILE_NOT_FOUND"

    def __init__(self, project_id: str, file_id: str) -> None:
        super().__init__(
            message=f"File '{file_id}' not found in project '{project_id}'.",
            detail={"project_id": project_id, "file_id": file_id},
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


class PriceBookConflictError(AppException):
    """The price book changed since the editor read it (optimistic concurrency)."""
    status_code = 409
    error_code = "VERSION_CONFLICT"

    def __init__(self, expected_version: int, current_version: int) -> None:
        super().__init__(
            message="The price book was modified by someone else. Reload and retry.",
            detail={"expected_version": expected_version, "current_version": current_version},
        )


class PriceBookSkuInUseError(AppException):
    """A save would remove SKUs that the AI's assembly library still points to."""
    status_code = 422
    error_code = "PRICE_BOOK_SKU_IN_USE"

    def __init__(self, skus: list[str]) -> None:
        super().__init__(
            message=(
                "These SKUs are used by the assembly library (renovation_assemblies.json) and cannot be "
                f"removed: {', '.join(skus[:10])}."
            ),
            detail={"skus": skus},
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


class QuoteDeliveryPendingError(AppException):
    """The quote's email is still being delivered: it cannot be reopened for revision yet."""
    status_code = 409
    error_code = "DELIVERY_PENDING"

    def __init__(self, project_id: str) -> None:
        super().__init__(
            message="The quote email is still being delivered; wait for it to go out before revising.",
            detail={"project_id": project_id},
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


class IdempotencyKeyRequiredError(AppException):
    """A send was requested without an Idempotency-Key header."""
    status_code = 428
    error_code = "IDEMPOTENCY_KEY_REQUIRED"

    def __init__(self) -> None:
        super().__init__(message="Send a unique Idempotency-Key header (8-128 chars) with every send request.")
