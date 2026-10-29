"""Low-level, idempotent erasure helpers (Firestore trees, queries, Storage
prefixes and objects) and the listings that find what is left to erase.

Firestore never cascades: deleting a document leaves its subcollections, and a
"missing" document can still have children. `iter_tree` walks the real tree
(`collections()` / `list_documents()`), so it also reaches data under parents
that were already deleted, and `delete_document_tree` deletes children before
parents: an interrupted run leaves the parent in place, still discoverable for
a retry.
"""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable, Iterable, Sequence
from dataclasses import dataclass
from typing import Any

from google.cloud.firestore_v1.base_query import FieldFilter
from src.db.batching import BatchWriter
from src.db.storage_paths import PROJECT_STORAGE_ROOTS

# Firestore `in` queries accept at most 30 values.
IN_QUERY_LIMIT = 30


async def delete_refs(db: Any, refs: list[Any]) -> int:
    """Delete `refs` in order, in bounded write batches."""
    async with BatchWriter(db) as writer:
        for ref in refs:
            await writer.delete(ref)
    return len(refs)


async def iter_tree(ref: Any, *, keep: Callable[[Any], bool] | None = None) -> AsyncIterator[Any]:
    """Snapshots (id, reference, update_time) of every existing document below
    `ref` — not `ref` itself — children before their parent.

    `keep(child_ref)` skips a nested document together with its own subtree.
    Snapshots come from a field-less projection: only metadata, never data.
    """
    async for sub in ref.collections():
        existing = {snap.id: snap async for snap in sub.select([]).stream()}
        async for child in sub.list_documents():
            if keep is not None and keep(child):
                continue
            async for snap in iter_tree(child, keep=keep):
                yield snap
            if child.id in existing:
                yield existing[child.id]


async def delete_document_tree(db: Any, ref: Any, *, keep: Callable[[Any], bool] | None = None) -> int:
    """Delete a document and everything under it; returns the documents deleted.

    `keep(child_ref)` spares a nested document together with its own subtree
    (e.g. a quote under legal hold). The root itself is always deleted.
    """
    refs = [snap.reference async for snap in iter_tree(ref, keep=keep)]
    if (await ref.get()).exists:
        refs.append(ref)  # parent last
    return await delete_refs(db, refs)


async def delete_query(db: Any, query: Any) -> int:
    """Delete every document a query matches (documents only, not their subtrees)."""
    refs = [snap.reference async for snap in query.stream()]
    return await delete_refs(db, refs)


async def refs_where_in(db: Any, collection: str, field: str, values: Sequence[str]) -> list[Any]:
    """References of the documents whose `field` is one of `values` (queried
    IN_QUERY_LIMIT values at a time; metadata only)."""
    refs: list[Any] = []
    for start in range(0, len(values), IN_QUERY_LIMIT):
        chunk = list(values[start:start + IN_QUERY_LIMIT])
        query = db.collection(collection).where(filter=FieldFilter(field, "in", chunk)).select([])
        refs.extend([snap.reference async for snap in query.stream()])
    return refs


async def delete_storage_prefix(bucket: Any, prefix: str, *, keep: frozenset[str] = frozenset()) -> int:
    """Delete every Storage object under `prefix`, except the paths in `keep`.

    Errors propagate (fail closed: an erasure step must never report success
    with files left behind). A prefix must be a folder ("…/"), never empty: a
    malformed one could match the whole bucket.
    """
    if not prefix.strip("/") or not prefix.endswith("/"):
        raise ValueError(f"Refusing to delete an unsafe Storage prefix: {prefix!r}")

    def _delete() -> int:
        blobs = [b for b in bucket.list_blobs(prefix=prefix) if b.name not in keep]
        if blobs:
            bucket.delete_blobs(blobs)
        return len(blobs)

    return await asyncio.to_thread(_delete)


def _already_gone(_blob: Any) -> None:
    """`delete_blobs` error callback: an object already deleted is not an error."""


async def delete_storage_paths(bucket: Any, paths: Iterable[str]) -> None:
    """Delete the named Storage objects. Idempotent: objects already gone are
    skipped; any other error propagates (fail closed)."""
    names = sorted(set(paths))
    if names:
        await asyncio.to_thread(bucket.delete_blobs, names, on_error=_already_gone)


async def storage_folder_ids(bucket: Any, root: str) -> set[str]:
    """Names of the "folders" directly under `root` ("user-uploads/" → the
    session ids that have uploads), listed without walking every object."""

    def _list() -> set[str]:
        listing = bucket.list_blobs(prefix=root, delimiter="/")
        for _blob in listing:  # prefixes are collected while the pages are read
            pass
        return {prefix[len(root):].rstrip("/") for prefix in listing.prefixes}

    return await asyncio.to_thread(_list)


@dataclass(frozen=True)
class ChatRemains:
    """Ids of every chat (= project) something is left of, by where it is found."""

    live: set[str]  # `sessions/{id}` documents
    session_remains: set[str]  # `sessions/{id}` subcollections without the document
    projections: set[str]  # `projects/{id}` documents or their subcollections
    stored: set[str]  # Storage folders under the project roots

    @property
    def all_ids(self) -> set[str]:
        return self.live | self.session_remains | self.projections | self.stored


async def find_chat_remains(db: Any, bucket: Any) -> ChatRemains:
    sessions = db.collection("sessions")
    live = {snap.id async for snap in sessions.select([]).stream()}
    session_remains = {ref.id async for ref in sessions.list_documents()} - live
    projections = {ref.id async for ref in db.collection("projects").list_documents()}
    stored: set[str] = set()
    for root in PROJECT_STORAGE_ROOTS:
        stored |= await storage_folder_ids(bucket, root)
    return ChatRemains(live=live, session_remains=session_remains, projections=projections, stored=stored)
