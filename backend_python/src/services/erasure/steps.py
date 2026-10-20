"""The registry of every place a user's personal data lives, as erasure steps.

Order matters:
- `auth_disable` first: with refresh tokens revoked the backend refuses the
  user's requests, so nothing new is written while the data is erased;
- `legal_hold` before anything under `projects/` is touched;
- the project and session trees after Storage and the side collections, so an
  interrupted run leaves the user's projects discoverable;
- `auth_delete` last.

Each step is idempotent (deleting what is already gone is a no-op) and returns
how many items it erased. Step NAMES are persisted in the job document to
resume after a failure: never rename one.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable, Iterator, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from google.cloud.firestore_v1 import DELETE_FIELD
from google.cloud.firestore_v1.base_query import FieldFilter

from src.db.purge import delete_document_tree, delete_query, delete_storage_prefix
from src.db.storage_paths import project_storage_prefixes, user_storage_prefixes
from src.services.auth_gateway import AuthGateway
from src.services.erasure.legal_hold import HeldQuote, find_held_quotes, mark_legal_hold
from src.services.erasure.models import ErasureMode

# Firestore `in` queries accept at most 30 values.
_IN_LIMIT = 30

# Profile fields an inactivity tombstone keeps: they stop the lifecycle from
# selecting the account again and prove the warning/disable happened.
_TOMBSTONE_FIELDS = ("lifecycle_warned_at", "lifecycle_disabled_at")


@dataclass
class ErasureContext:
    db: Any
    bucket: Any
    auth: AuthGateway
    uid: str
    mode: ErasureMode
    project_ids: Sequence[str]
    now: datetime
    _held: dict[str, list[HeldQuote]] = field(default_factory=dict)

    async def held_quotes(self, project_id: str) -> list[HeldQuote]:
        if project_id not in self._held:
            self._held[project_id] = await find_held_quotes(self.db, project_id, now=self.now)
        return self._held[project_id]


def _chunks(values: Sequence[str]) -> Iterator[list[str]]:
    for start in range(0, len(values), _IN_LIMIT):
        yield list(values[start:start + _IN_LIMIT])


def _where(db: Any, collection: str, field: str, op: str, value: Any) -> Any:
    return db.collection(collection).where(filter=FieldFilter(field, op, value))


# ── Steps ────────────────────────────────────────────────────────────────────

async def _auth_disable(ctx: ErasureContext) -> int:
    return int(await ctx.auth.disable_and_revoke(ctx.uid))


async def _legal_hold(ctx: ErasureContext) -> int:
    marked = 0
    for pid in ctx.project_ids:
        for held in await ctx.held_quotes(pid):
            await mark_legal_hold(ctx.db, pid, held, now=ctx.now)
            marked += 1
    return marked


async def _email_outbox(ctx: ErasureContext) -> int:
    """Queued/sent email records of the user's projects (also cancels a pending send)."""
    deleted = 0
    for chunk in _chunks(ctx.project_ids):
        for collection in ("email_outbox", "email_messages"):
            deleted += await delete_query(ctx.db, _where(ctx.db, collection, "project_id", "in", chunk))
    return deleted


async def _leads(ctx: ErasureContext) -> int:
    deleted = await delete_query(ctx.db, _where(ctx.db, "leads", "uid", "==", ctx.uid))
    for chunk in _chunks(ctx.project_ids):  # leads written while the user was a guest
        deleted += await delete_query(ctx.db, _where(ctx.db, "leads", "session_id", "in", chunk))
    return deleted


async def _quote_batches(ctx: ErasureContext) -> int:
    return await delete_query(ctx.db, _where(ctx.db, "quote_batches", "user_id", "==", ctx.uid))


async def _testimonials(ctx: ErasureContext) -> int:
    """Erasure request = consent withdrawn: every review goes. Inactivity: a
    published review stays "while published" (privacy policy), detached from
    the account; the others go."""
    erased = 0
    async for snap in _where(ctx.db, "testimonials", "userId", "==", ctx.uid).stream():
        published = (snap.to_dict() or {}).get("status") == "approved"
        if ctx.mode is ErasureMode.INACTIVITY and published:
            await snap.reference.update({"userId": DELETE_FIELD})
        else:
            await snap.reference.delete()
        erased += 1
    return erased


async def _storage(ctx: ErasureContext) -> int:
    deleted = 0
    for pid in ctx.project_ids:
        keep = frozenset().union(*(h.blob_paths for h in await ctx.held_quotes(pid)))
        for prefix in project_storage_prefixes(pid):
            deleted += await delete_storage_prefix(ctx.bucket, prefix, keep=keep)
    for prefix in user_storage_prefixes(ctx.uid):
        deleted += await delete_storage_prefix(ctx.bucket, prefix)
    return deleted


async def _projects(ctx: ErasureContext) -> int:
    """`projects/{pid}` and everything under it, except quotes under legal hold."""
    deleted = 0
    for pid in ctx.project_ids:
        held_ids = {h.doc_id for h in await ctx.held_quotes(pid)}

        def keep(ref: Any, held_ids: set[str] = held_ids) -> bool:
            return ref.parent.id == "private_data" and ref.id in held_ids

        deleted += await delete_document_tree(ctx.db, ctx.db.collection("projects").document(pid), keep=keep)
    return deleted


async def _sessions(ctx: ErasureContext) -> int:
    """`sessions/{pid}`: messages, files, feedback and the session itself."""
    deleted = 0
    for pid in ctx.project_ids:
        deleted += await delete_document_tree(ctx.db, ctx.db.collection("sessions").document(pid))
    return deleted


async def _usage_quotas(ctx: ErasureContext) -> int:
    return await delete_query(ctx.db, _where(ctx.db, "usage_quotas", "user_id", "==", ctx.uid))


async def _passkey_challenges(ctx: ErasureContext) -> int:
    return await delete_query(ctx.db, _where(ctx.db, "passkey_challenges", "user_id", "==", ctx.uid))


async def _pending_notifications(ctx: ErasureContext) -> int:
    """Undelivered notices keep only the recipient's address (no uid): found by
    the email Firebase Auth holds — so this runs before `auth_delete`."""
    contact = await ctx.auth.get_contact(ctx.uid)
    if contact is None or not contact.email:
        return 0
    return await delete_query(ctx.db, _where(ctx.db, "pending_notifications", "metadata.email", "==", contact.email))


async def _user_profile(ctx: ErasureContext) -> int:
    """Account deletion: `users/{uid}` and its subcollections (preferences,
    passkeys). Inactivity: the subcollections, and the profile is replaced
    (plain set, no merge) by a tombstone without any personal data."""
    ref = ctx.db.collection("users").document(ctx.uid)
    if ctx.mode is ErasureMode.ACCOUNT_DELETION:
        return await delete_document_tree(ctx.db, ref)

    deleted = 0
    async for sub in ref.collections():
        async for child in sub.list_documents():
            deleted += await delete_document_tree(ctx.db, child)
    snapshot = await ref.get()
    profile = (snapshot.to_dict() or {}) if snapshot.exists else {}
    await ref.set({**{k: profile[k] for k in _TOMBSTONE_FIELDS if k in profile}, "anonymized": True})
    return deleted + 1


async def _auth_delete(ctx: ErasureContext) -> int:
    return int(await ctx.auth.delete_user(ctx.uid))


@dataclass(frozen=True)
class ErasureStep:
    name: str
    run: Callable[[ErasureContext], Awaitable[int]]


ERASURE_STEPS: tuple[ErasureStep, ...] = (
    ErasureStep("auth_disable", _auth_disable),
    ErasureStep("legal_hold", _legal_hold),
    ErasureStep("email_outbox", _email_outbox),
    ErasureStep("leads", _leads),
    ErasureStep("quote_batches", _quote_batches),
    ErasureStep("testimonials", _testimonials),
    ErasureStep("storage", _storage),
    ErasureStep("projects", _projects),
    ErasureStep("sessions", _sessions),
    ErasureStep("usage_quotas", _usage_quotas),
    ErasureStep("passkey_challenges", _passkey_challenges),
    ErasureStep("pending_notifications", _pending_notifications),
    ErasureStep("user_profile", _user_profile),
    ErasureStep("auth_delete", _auth_delete),
)
