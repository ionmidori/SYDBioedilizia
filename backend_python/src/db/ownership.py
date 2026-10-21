"""Who owns a project document (`sessions/{id}` or its `projects/{id}` projection).

One definition for every caller that decides whose data something is — the
user erasure (whose projects to erase), the retention job (whether remains
belong to a registered account), the session retention backfill. Dependency
free on purpose: `src.db.projects` imports modules that import this one.
"""
from typing import Any

# Owner placeholder of a session created without a user (conversation_repository).
GUEST_OWNER_PREFIX = "guest_"

# Every spelling of the owner field: `userId` today, `user_id`/`uid` on legacy projections.
OWNER_KEYS = ("userId", "user_id", "uid")


def is_guest_placeholder(owner: Any) -> bool:
    """A missing owner or a `guest_*` placeholder: no account behind it."""
    return not isinstance(owner, str) or not owner or owner.startswith(GUEST_OWNER_PREFIX)


def real_owners(data: dict[str, Any]) -> list[str]:
    """The account uids a document names as its owner, in OWNER_KEYS order."""
    owners: list[str] = []
    for key in OWNER_KEYS:
        owner = data.get(key)
        if isinstance(owner, str) and not is_guest_placeholder(owner) and owner not in owners:
            owners.append(owner)
    return owners
