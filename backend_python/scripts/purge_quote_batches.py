"""Remove the quote batches (Phase 138 PR-4): WRITES to live Firestore with --apply.

A quote is now sent on its own (POST /api/quote/{id}/submit), so the
`quote_batches` documents and the `request.batch_id` field of the quotes are
left over. This deletes every `quote_batches/*` document and clears
`request.batch_id` from the quotes.

First it runs the check the GDPR erasure needs (src/services/erasure/discovery.py):
the erasure also finds a user's projects through their batches. A project
reachable ONLY that way — the user is not its owner (sessions/projects owner
fields) and no lead of the user points at it, and no other account owns it —
would be left out of a later erasure once its batch is gone. If there is any,
nothing is written: fix their owner first.

After --apply, the closing PR removes the GDPR step `_quote_batches`, its use in
discovery.py, `QuoteRequest.batch_id` and the `quote_batches` index.

It acts on whatever project the credentials in `.env` point at (including
production). Without `--apply` it only reports what it would change.

Usage (from backend_python/):
    uv run python scripts/purge_quote_batches.py            # dry run
    uv run python scripts/purge_quote_batches.py --apply    # write
"""
import argparse
import asyncio
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

load_dotenv()

# Make `src` importable from any cwd: this file lives in backend_python/scripts/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from google.cloud.firestore_v1 import DELETE_FIELD, Query  # noqa: E402
from google.cloud.firestore_v1.base_query import FieldFilter  # noqa: E402
from src.db.firebase_client import get_async_firestore_client  # noqa: E402
from src.db.ownership import real_owners  # noqa: E402

BATCHES = "quote_batches"


@dataclass
class PurgePlan:
    batch_ids: list[str] = field(default_factory=list)
    # Quote documents that still carry request.batch_id.
    quote_refs: list[Any] = field(default_factory=list)
    # (uid, project_id) pairs a later erasure would no longer find.
    only_via_batch: list[tuple[str, str]] = field(default_factory=list)


def _batch_projects(batch: dict[str, Any]) -> list[str]:
    return [
        entry["project_id"] for entry in batch.get("projects") or []
        if isinstance(entry, dict) and isinstance(entry.get("project_id"), str) and entry["project_id"]
    ]


async def _owners(db: Any, project_id: str) -> set[str]:
    owners: set[str] = set()
    for collection in ("sessions", "projects"):
        snap = await db.collection(collection).document(project_id).get()
        if snap.exists:
            owners.update(real_owners(snap.to_dict() or {}))
    return owners


async def _lead_sessions(db: Any, uid: str) -> set[str]:
    sessions: set[str] = set()
    async for snap in db.collection("leads").where(filter=FieldFilter("uid", "==", uid)).stream():
        session_id = (snap.to_dict() or {}).get("session_id")
        if isinstance(session_id, str) and session_id:
            sessions.add(session_id)
    return sessions


def _quote_ref(db: Any, project_id: str) -> Any:
    return db.collection("projects").document(project_id).collection("private_data").document("quote")


async def plan_purge(db: Any) -> PurgePlan:
    plan = PurgePlan()
    referenced: set[str] = set()
    async for snap in db.collection(BATCHES).stream():
        plan.batch_ids.append(snap.id)
        batch = snap.to_dict() or {}
        uid = batch.get("user_id")
        if not isinstance(uid, str) or not uid:
            continue  # no user to erase: nothing depends on this batch
        leads = await _lead_sessions(db, uid)
        for project_id in _batch_projects(batch):
            referenced.add(project_id)
            owners = await _owners(db, project_id)
            # Found anyway (owner or lead), or someone else's (the erasure skips it).
            if uid in owners or project_id in leads or owners:
                continue
            plan.only_via_batch.append((uid, project_id))
    # Same shape as the admin inbox query: it has a composite index (doc_type +
    # updated_at); doc_type alone on the collection group has none.
    quotes = (
        db.collection_group("private_data")
        .where(filter=FieldFilter("doc_type", "==", "quote"))
        .order_by("updated_at", direction=Query.DESCENDING)
    )
    found: dict[str, Any] = {}
    async for snap in quotes.stream():
        if ((snap.to_dict() or {}).get("request") or {}).get("batch_id"):
            found[snap.reference.path] = snap.reference
    # The quotes of the batches' projects are read directly too: a quote without
    # updated_at is not returned by the ordered query.
    for project_id in sorted(referenced):
        ref = _quote_ref(db, project_id)
        snap = await ref.get()
        if snap.exists and ((snap.to_dict() or {}).get("request") or {}).get("batch_id"):
            found[ref.path] = ref
    plan.quote_refs = list(found.values())
    return plan


async def apply_purge(db: Any, plan: PurgePlan) -> None:
    if plan.only_via_batch:
        raise RuntimeError("Some projects are reachable only through a batch: nothing written.")
    for ref in plan.quote_refs:
        await ref.update({"request.batch_id": DELETE_FIELD})
    for batch_id in plan.batch_ids:
        await db.collection(BATCHES).document(batch_id).delete()


def _short(project_id: str) -> str:
    # A project id is the chat session id (an access token for guests): never print it whole.
    return f"{project_id[:6]}…"


async def _run(apply: bool) -> int:
    db = get_async_firestore_client()
    plan = await plan_purge(db)
    print(f"Quote batches:                 {len(plan.batch_ids)}")
    print(f"Quotes with request.batch_id:  {len(plan.quote_refs)}")
    print(f"Projects only via a batch:     {len(plan.only_via_batch)}")
    for uid, project_id in plan.only_via_batch:
        print(f"  - user {uid}, project {_short(project_id)}")
    if plan.only_via_batch:
        print("Refused: give these projects their owner first (the GDPR erasure would miss them).")
        return 1
    if not apply:
        print("Dry run. Re-run with --apply to delete the batches and clear request.batch_id.")
        return 0
    await apply_purge(db, plan)
    print(f"Deleted {len(plan.batch_ids)} batches, cleared batch_id on {len(plan.quote_refs)} quotes.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="actually delete the batches")
    args = parser.parse_args()
    return asyncio.run(_run(args.apply))


if __name__ == "__main__":
    raise SystemExit(main())
