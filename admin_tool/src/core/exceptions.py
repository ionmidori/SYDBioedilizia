"""
Lightweight exception hierarchy for the Admin Console (Streamlit).

Mirrors src/core/exceptions.py in backend_python but is independent —
the admin_tool has no direct dependency on the FastAPI backend source.

Skill: error-handling-patterns — §Custom Exception Hierarchy
"""
from __future__ import annotations


class AdminError(Exception):
    """Base exception for admin console operations."""

    def __init__(self, message: str, error_code: str, details: dict | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.details: dict = details or {}


class QuoteNotFoundError(AdminError):
    """Firestore document not found for the given project_id."""

    def __init__(self, project_id: str) -> None:
        super().__init__(
            message=f"Preventivo non trovato per il progetto '{project_id}'.",
            error_code="QUOTE_NOT_FOUND",
            details={"project_id": project_id},
        )


class QuoteAlreadyApprovedError(AdminError):
    """Quote is already approved — idempotency guard."""

    def __init__(self, project_id: str) -> None:
        super().__init__(
            message=f"Il preventivo per '{project_id}' è già stato approvato.",
            error_code="QUOTE_ALREADY_APPROVED",
            details={"project_id": project_id},
        )


class QuoteApprovalError(AdminError):
    """
    POST /internal/quote/approve (backend) failed — config, auth, HTTP, or
    network error. Approve/reject must never silently succeed: this is
    always raised, never swallowed, by AdminService.
    """

    def __init__(self, message: str) -> None:
        super().__init__(message=message, error_code="QUOTE_APPROVAL_ERROR")
