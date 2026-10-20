"""Which projects (= chat sessions, same id) belong to a user.

Sources, because no single field is reliable on its own:
- `sessions.userId` — the backend record of a project;
- `projects.userId` and the legacy `user_id` / `uid` spellings — the public
  projection, which may outlive its session;
- `quote_batches.projects[].project_id` — projects sent together in a batch;
- `leads.session_id` — legacy quote requests.

The last two are only POINTERS (legacy leads were never validated): a project
they name is erased only if it does not belong to another user — one bad
reference must never erase someone else's data. Owned projects and ownerless /
guest ones (a lead written while the user chatted as a guest) qualify.

The erasure service persists the result before deleting anything and merges
it with every later discovery, so a resumed job still reaches projects whose
owner documents a previous run already deleted.
"""
from __future__ import annotations

import logging
from typing import Any

from google.cloud.firestore_v1.base_query import FieldFilter

from src.db.storage_paths import is_safe_id

logger = logging.getLogger(__name__)

_OWNER_FIELDS = (("sessions", "userId"), ("projects", "userId"), ("projects", "user_id"), ("projects", "uid"))
_OWNER_KEYS = ("userId", "user_id", "uid")
_GUEST_OWNER_PREFIX = "guest_"


async def _not_someone_elses(db: Any, project_id: str, uid: str) -> bool:
    """True unless the session or its projection names another real owner."""
    for collection in ("sessions", "projects"):
        snap = await db.collection(collection).document(project_id).get()
        if not snap.exists:
            continue
        data = snap.to_dict() or {}
        for key in _OWNER_KEYS:
            owner = data.get(key)
            if isinstance(owner, str) and owner and owner != uid and not owner.startswith(_GUEST_OWNER_PREFIX):
                return False
    return True


async def _referenced_project_ids(db: Any, uid: str) -> set[str]:
    refs: set[str] = set()
    async for snap in db.collection("quote_batches").where(filter=FieldFilter("user_id", "==", uid)).stream():
        for entry in (snap.to_dict() or {}).get("projects") or []:
            if isinstance(entry, dict) and isinstance(entry.get("project_id"), str) and entry["project_id"]:
                refs.add(entry["project_id"])
    async for snap in db.collection("leads").where(filter=FieldFilter("uid", "==", uid)).stream():
        session_id = (snap.to_dict() or {}).get("session_id")
        if isinstance(session_id, str) and session_id:
            refs.add(session_id)
    return refs


async def discover_project_ids(db: Any, uid: str) -> set[str]:
    ids: set[str] = set()
    for collection, field in _OWNER_FIELDS:
        query = db.collection(collection).where(filter=FieldFilter(field, "==", uid)).select([])
        async for snap in query.stream():
            ids.add(snap.id)

    for pid in await _referenced_project_ids(db, uid) - ids:
        if not is_safe_id(pid):
            # Not an id our code creates; a "/" would even address another document.
            logger.warning("[Erasure] Ignoring a malformed project reference")
        elif await _not_someone_elses(db, pid, uid):
            ids.add(pid)
        else:
            logger.warning("[Erasure] Ignoring a reference to a project owned by another user", extra={"project_id": pid})

    return ids
