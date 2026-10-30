"""
Batch deletion helper for project subcollections (scripts/cleanup_zombie_projects.py).

Users no longer delete a chat (Phase 139: one chat per user, erased only with the
account); the retention job (src/services/retention) erases what is past its time.
"""


async def _delete_collection_batch(db, coll_ref, batch_size=50):
    """
    Helper to delete a collection in batches.
    """
    # Use list() to consume stream immediately
    docs = [d async for d in coll_ref.limit(batch_size).stream()]

    if not docs:
        return 0

    batch = db.batch()
    for doc in docs:
        batch.delete(doc.reference)
    await batch.commit()

    deleted = len(docs)

    if deleted >= batch_size:
        return deleted + await _delete_collection_batch(db, coll_ref, batch_size)
    return deleted
