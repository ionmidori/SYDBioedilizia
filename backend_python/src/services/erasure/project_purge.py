"""Erasing one project completely — shared by the user erasure and the
retention job.

A project (= chat session, same id) lives in `sessions/{pid}` (messages, files,
feedback), in its projection `projects/{pid}` (files, the quote with its
revisions and deliveries, legacy HITL tokens) and in four Storage folders.
Quotes that reached the client stay, with their PDFs, under legal hold
(legal_hold.py); everything else goes.

Order: hold, Storage, projection and the session LAST — it carries what
selected the project for deletion (guest expiry, soft-delete mark), so an
interrupted purge is found again and finished. Every step is idempotent.
"""
from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Any

from src.db.purge import delete_document_tree, delete_storage_prefix
from src.db.storage_paths import project_storage_prefixes
from src.services.erasure.legal_hold import HeldQuote, find_held_quotes, mark_legal_hold


async def hold_sent_quotes(db: Any, project_id: str, held: Sequence[HeldQuote], *, now: datetime) -> int:
    for quote in held:
        await mark_legal_hold(db, project_id, quote, now=now)
    return len(held)


async def purge_project_storage(bucket: Any, project_id: str, held: Sequence[HeldQuote]) -> int:
    keep = frozenset().union(*(quote.blob_paths for quote in held))
    deleted = 0
    for prefix in project_storage_prefixes(project_id):
        deleted += await delete_storage_prefix(bucket, prefix, keep=keep)
    return deleted


async def purge_projection(db: Any, project_id: str, held: Sequence[HeldQuote]) -> int:
    """`projects/{pid}` and everything under it, except the held quotes."""
    held_ids = {quote.doc_id for quote in held}

    def keep(ref: Any) -> bool:
        return ref.parent.id == "private_data" and ref.id in held_ids

    return await delete_document_tree(db, db.collection("projects").document(project_id), keep=keep)


async def purge_session(db: Any, project_id: str) -> int:
    """`sessions/{pid}`: messages, files, feedback and the session itself."""
    return await delete_document_tree(db, db.collection("sessions").document(project_id))


async def purge_project(db: Any, bucket: Any, project_id: str, *, now: datetime) -> int:
    """The whole project, in the order above. Returns the documents and Storage
    objects deleted (0: nothing was left but held quotes)."""
    held = await find_held_quotes(db, project_id, now=now)
    await hold_sent_quotes(db, project_id, held, now=now)
    return (
        await purge_project_storage(bucket, project_id, held)
        + await purge_projection(db, project_id, held)
        + await purge_session(db, project_id)
    )
