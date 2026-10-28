"""Which projects (= chat sessions, same id) belong to a user.

Sources, because no single field is reliable on its own:
- `sessions.userId` — the backend record of a project;
- `projects.userId` and the legacy `user_id` / `uid` spellings — the public
  projection, which may outlive its session;
- `leads.session_id` — legacy quote requests.

Plus the ids a previous run of the same erasure found (`known`): the service
persists the scope before deleting anything, so a resumed job still reaches
projects whose owner documents — or the pointers to them — were already erased.

One rule decides the scope, on every run and for every candidate: a project is
in scope only if neither its session nor its projection names ANOTHER real
owner. Owned, ownerless and guest projects (a lead written while the user
chatted as a guest) qualify. Pointers are unverified (legacy leads were never
validated) and ownership changes over time (the guest claim hands a guest's
projects to its account), so neither a reference nor a past run's verdict
is trusted: one stale or forged id must never erase someone else's data.
"""
from __future__ import annotations

import logging
from collections.abc import Iterable
from typing import Any

from google.cloud.firestore_v1.base_query import FieldFilter

from src.db.ownership import OWNER_KEYS, real_owners
from src.db.storage_paths import is_safe_id

logger = logging.getLogger(__name__)

_OWNER_FIELDS = (("sessions", "userId"), *(("projects", key) for key in OWNER_KEYS))


async def _not_someone_elses(db: Any, project_id: str, uid: str) -> bool:
    """True unless the session or its projection names another real owner."""
    for collection in ("sessions", "projects"):
        snap = await db.collection(collection).document(project_id).get()
        if snap.exists and any(owner != uid for owner in real_owners(snap.to_dict() or {})):
            return False
    return True


async def _referenced_project_ids(db: Any, uid: str) -> set[str]:
    refs: set[str] = set()
    async for snap in db.collection("leads").where(filter=FieldFilter("uid", "==", uid)).stream():
        session_id = (snap.to_dict() or {}).get("session_id")
        if isinstance(session_id, str) and session_id:
            refs.add(session_id)
    return refs


async def discover_project_ids(db: Any, uid: str, *, known: Iterable[str] = ()) -> set[str]:
    """The projects to erase for `uid` as of NOW. Call it at the start of every
    run, right before the steps: the scope is only as fresh as this check."""
    candidates = set(known) | await _referenced_project_ids(db, uid)
    for collection, field in _OWNER_FIELDS:
        query = db.collection(collection).where(filter=FieldFilter(field, "==", uid)).select([])
        async for snap in query.stream():
            candidates.add(snap.id)

    ids: set[str] = set()
    for pid in sorted(candidates):
        if not is_safe_id(pid):
            # Not an id our code creates; a "/" would even address another document.
            logger.warning("[Erasure] Ignoring a malformed project reference")
        elif await _not_someone_elses(db, pid, uid):
            ids.add(pid)
        else:
            logger.warning("[Erasure] Ignoring a project owned by another user", extra={"project_id": pid})
    return ids
