"""Where a project's and a user's files live in Firebase Storage.

`project_storage_prefixes` is the complete set an erasure must clear;
`src/utils/download.session_storage_prefixes` is the narrower subset the
backend may READ for a session (authorization), and must stay a subset of it.
"""
import re

# Same shape as the session/project ids accepted by the upload endpoints.
_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


def is_safe_id(value: str) -> bool:
    """A project/user id that can be used in a Storage prefix or a Firestore path."""
    return bool(_ID.match(value or ""))


def _checked(value: str, kind: str) -> str:
    # An empty or slashed id would turn "x/{id}/" into a much wider prefix.
    if not is_safe_id(value):
        raise ValueError(f"Invalid {kind} for a Storage prefix: {value!r}")
    return value


def project_storage_prefixes(project_id: str) -> tuple[str, ...]:
    """Every Storage folder of a project (= chat session id).

    user-uploads/: chat photos and videos · projects/: dashboard uploads and
    quote PDFs · renders/: generated renders · documents/: legacy documents.
    """
    pid = _checked(project_id, "project id")
    return (f"user-uploads/{pid}/", f"projects/{pid}/", f"renders/{pid}/", f"documents/{pid}/")


def user_storage_prefixes(uid: str) -> tuple[str, ...]:
    """Every Storage folder of a user account (avatar)."""
    return (f"users/{_checked(uid, 'uid')}/",)
