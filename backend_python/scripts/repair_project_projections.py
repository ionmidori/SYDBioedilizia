"""
Repair `projects/{id}` projections missing their owner (10 Oct 2026).

Projects created from the dashboard ("Nuovo progetto" → db.projects.create_project)
wrote only `sessions/{id}`; the cover sync later created `projects/{id}` with
just `thumbnailUrl`/`updatedAt` — no `userId`, `id`, `name`. Every reader of
the projection then treated the project as not owned: quote submission
("Batch: user doesn't own project"), the client "Preventivi" list, ownership
checks, storage.rules. create_project is fixed; this script repairs the
existing documents.

Only MISSING fields are added (merge); an existing `userId` is never changed —
a projection whose owner differs from the session is reported as a conflict
and left untouched for a human decision.

Usage (dry run by default — prints the plan, writes nothing):
    cd backend_python && uv run python scripts/repair_project_projections.py
    cd backend_python && uv run python scripts/repair_project_projections.py --apply
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from src.db.firebase_client import get_async_firestore_client  # noqa: E402
from src.db.projects.mutations import project_projection  # noqa: E402
from src.utils.datetime_utils import utc_now  # noqa: E402


def plan_repair(session_id: str, session: dict[str, Any], projection: dict[str, Any] | None) -> tuple[str, dict[str, Any]]:
    """Decide what to do for one project.

    Returns (action, fields): action is "ok", "repair", "conflict" or "skip";
    fields are the missing projection fields to merge (only for "repair").
    """
    owner = session.get("userId")
    if not owner or session.get("is_deleted"):
        return "skip", {}
    current = projection or {}
    if current.get("userId") and current["userId"] != owner:
        return "conflict", {}
    created = session.get("createdAt") or utc_now()
    desired = project_projection(session_id, owner, session.get("title") or "Nuovo Progetto", created)
    desired["updatedAt"] = session.get("updatedAt") or created
    missing = {k: v for k, v in desired.items() if current.get(k) in (None, "")}
    return ("repair", missing) if missing else ("ok", {})


async def run(db: Any, apply: bool) -> dict[str, int]:
    counts = {"ok": 0, "repair": 0, "conflict": 0, "skip": 0}
    async for session_doc in db.collection("sessions").stream():
        session = session_doc.to_dict() or {}
        proj_ref = db.collection("projects").document(session_doc.id)
        proj_snap = await proj_ref.get()
        projection = (proj_snap.to_dict() or {}) if proj_snap.exists else None
        action, fields = plan_repair(session_doc.id, session, projection)
        counts[action] += 1
        if action in ("repair", "conflict"):
            print(f"{action:8} {session_doc.id}  fields={sorted(fields)}")
        if action == "repair" and apply:
            await proj_ref.set(fields, merge=True)
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="write the repairs (default: dry run)")
    args = parser.parse_args()
    counts = asyncio.run(run(get_async_firestore_client(), apply=args.apply))
    mode = "APPLIED" if args.apply else "DRY RUN (nothing written)"
    print(f"\n{mode}: " + ", ".join(f"{k}={v}" for k, v in counts.items()))


if __name__ == "__main__":
    main()
