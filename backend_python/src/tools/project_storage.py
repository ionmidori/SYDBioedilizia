"""
Ownership check and file listing shared by the gallery and project-files tools.

Synchronous (Firebase Admin SDK): callers run it in a thread.
"""
from __future__ import annotations

import logging
from collections.abc import Iterator

from firebase_admin import firestore, storage
from src.utils.download import session_storage_prefixes

logger = logging.getLogger(__name__)

# Projects store the owner as `userId` (conversation_repository.ensure_session);
# `user_id` / `uid` are legacy spellings, accepted only if they match too.
_OWNER_FIELDS = ("userId", "user_id", "uid")


class ProjectAccessError(Exception):
    """The project does not exist or is not owned by the caller."""


def assert_project_owner(session_id: str, user_id: str) -> None:
    if not user_id:
        raise ProjectAccessError("User not authenticated")
    snap = firestore.client().collection("projects").document(session_id).get()
    if not snap.exists:
        raise ProjectAccessError("Project not found")
    data = snap.to_dict() or {}
    owner = next((data[f] for f in _OWNER_FIELDS if data.get(f)), None)
    if owner != user_id:
        # No ids in the log: a session id is an access token (CodeQL py/clear-text-logging).
        logger.warning("[Tool] Project access denied (caller is not the owner)")
        raise ProjectAccessError("Access Denied")


def iter_project_blobs(session_id: str) -> Iterator:
    """Every file of the project, across all its storage prefixes."""
    bucket = storage.bucket()
    for prefix in session_storage_prefixes(session_id):
        for blob in bucket.list_blobs(prefix=prefix):
            if not blob.name.endswith("/"):
                yield blob
