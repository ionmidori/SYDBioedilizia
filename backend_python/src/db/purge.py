"""Low-level, idempotent erasure helpers (Firestore trees, queries, Storage prefixes).

Firestore never cascades: deleting a document leaves its subcollections, and a
"missing" document can still have children. `delete_document_tree` walks the
real tree (`collections()` / `list_documents()`), so it also reaches data under
parents that were already deleted, and it deletes children before parents: an
interrupted run leaves the parent in place, still discoverable for a retry.
"""
from __future__ import annotations

import asyncio
from collections.abc import Callable
from typing import Any

# Deletes per write batch (Firestore allows 500 writes per batch).
_BATCH_SIZE = 400


async def _delete_refs(db: Any, refs: list[Any]) -> int:
    """Delete `refs` in order, in bounded write batches."""
    for start in range(0, len(refs), _BATCH_SIZE):
        batch = db.batch()
        for ref in refs[start:start + _BATCH_SIZE]:
            batch.delete(ref)
        await batch.commit()
    return len(refs)


async def _collect_tree(ref: Any, keep: Callable[[Any], bool] | None, out: list[Any]) -> None:
    """Append to `out` every existing document under `ref`, children first."""
    async for sub in ref.collections():
        existing = {snap.id async for snap in sub.select([]).stream()}
        async for child in sub.list_documents():
            if keep is not None and keep(child):
                continue
            await _collect_tree(child, keep, out)
            if child.id in existing:
                out.append(child)


async def delete_document_tree(db: Any, ref: Any, *, keep: Callable[[Any], bool] | None = None) -> int:
    """Delete a document and everything under it; returns the documents deleted.

    `keep(child_ref)` spares a nested document together with its own subtree
    (e.g. a quote under legal hold). The root itself is always deleted.
    """
    refs: list[Any] = []
    await _collect_tree(ref, keep, refs)
    if (await ref.get()).exists:
        refs.append(ref)  # parent last
    return await _delete_refs(db, refs)


async def delete_query(db: Any, query: Any) -> int:
    """Delete every document a query matches (documents only, not their subtrees)."""
    refs = [snap.reference async for snap in query.stream()]
    return await _delete_refs(db, refs)


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
