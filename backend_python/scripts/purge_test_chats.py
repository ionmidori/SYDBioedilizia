"""Delete every chat of the test period (Phase 139): WRITES to live Firestore and Storage.

Until Phase 139 all chats in production were tests (owner's decision, 29 Oct
2026), and the product moves to one chat per user. This deletes, for good:
- every chat (= project): `sessions/{id}` and `projects/{id}` with everything
  under them (messages, files, rooms, the quote with its revisions and
  deliveries) and its Storage folders — quotes under legal hold included, as
  they were tests too;
- what points at those chats: queued/sent email records, legal hold registry,
  per-chat usage quotas, leads, guest claim tickets, their audit records, the
  users' chat pointers;
- LAST, the quote number counters: the next quote is PRV-<year>-0001.
Accounts (Firebase Auth), `users/{uid}` profiles with preferences and passkeys,
avatars and site content (portfolio, testimonials, gallery, price book) stay.

It writes to whatever project the credentials in `.env` point at. Without
`--apply` it only reports. With `--apply` it holds the GDPR lifecycle lease,
so it never runs together with the retention job. Run it, then run the dry
run again: it must find nothing. One-off: removed with Phase 139 PR-2.

Usage (from backend_python/):
    uv run python scripts/purge_test_chats.py            # dry run
    uv run python scripts/purge_test_chats.py --apply    # delete
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

from google.cloud.firestore_v1 import DELETE_FIELD  # noqa: E402
from src.core.config import settings  # noqa: E402
from src.db.firebase_client import get_async_firestore_client, get_storage_client  # noqa: E402
from src.db.purge import delete_refs, find_chat_remains, refs_where_in  # noqa: E402
from src.db.storage_paths import is_safe_id  # noqa: E402
from src.services.erasure.project_purge import purge_project_storage, purge_projection, purge_session  # noqa: E402
from src.services.lifecycle_lock import lifecycle_lease  # noqa: E402
from src.services.quote_numbering import COUNTERS_COLLECTION  # noqa: E402
from src.services.user_chat.service import CHAT_ASSIGNED_AT, CHAT_ID, USERS_COLLECTION  # noqa: E402

_QUOTE_COUNTER_PREFIX = "quote_"


@dataclass
class WipePlan:
    chat_ids: list[str]
    skipped_ids: list[str]  # malformed ids: never turned into Storage prefixes
    email: list[Any] = field(default_factory=list)
    legal_holds: list[Any] = field(default_factory=list)
    usage_quotas: list[Any] = field(default_factory=list)
    leads: list[Any] = field(default_factory=list)
    guest_claim_tickets: list[Any] = field(default_factory=list)
    audit_logs: list[Any] = field(default_factory=list)
    chat_pointers: list[Any] = field(default_factory=list)
    quote_counters: list[Any] = field(default_factory=list)

    def counts(self) -> dict[str, int]:
        return {
            "email": len(self.email), "legal_holds": len(self.legal_holds),
            "usage_quotas": len(self.usage_quotas), "leads": len(self.leads),
            "guest_claim_tickets": len(self.guest_claim_tickets), "audit_logs": len(self.audit_logs),
            "chat_pointers": len(self.chat_pointers), "quote_counters": len(self.quote_counters),
        }


async def _all(db: Any, collection: str) -> list[Any]:
    return [snap.reference async for snap in db.collection(collection).select([]).stream()]


def _unique(refs: list[Any]) -> list[Any]:
    return list({ref.path: ref for ref in refs}.values())


async def plan_wipe(db: Any, bucket: Any) -> WipePlan:
    """What a run deletes (reads only)."""
    ids = (await find_chat_remains(db, bucket)).all_ids
    chat_ids = sorted(pid for pid in ids if is_safe_id(pid))
    plan = WipePlan(chat_ids=chat_ids, skipped_ids=sorted(ids - set(chat_ids)))
    for collection in ("email_outbox", "email_messages"):
        plan.email += await refs_where_in(db, collection, "project_id", chat_ids)
    plan.legal_holds = await _all(db, "legal_holds")
    plan.usage_quotas = await refs_where_in(db, "usage_quotas", "project_id", chat_ids)
    plan.leads = await refs_where_in(db, "leads", "session_id", chat_ids)
    plan.guest_claim_tickets = await _all(db, "guest_claim_tickets")
    plan.audit_logs = _unique([
        *await refs_where_in(db, "audit_logs", "resource_id", chat_ids),
        *await refs_where_in(db, "audit_logs", "session_id", chat_ids),
        *await refs_where_in(db, "audit_logs", "metadata.project_id", chat_ids),  # file deletions
    ])
    users = db.collection(USERS_COLLECTION).select([CHAT_ID, CHAT_ASSIGNED_AT])
    plan.chat_pointers = [
        snap.reference async for snap in users.stream()
        if {CHAT_ID, CHAT_ASSIGNED_AT} & set(snap.to_dict() or {})
    ]
    plan.quote_counters = [
        ref for ref in await _all(db, COUNTERS_COLLECTION) if ref.id.startswith(_QUOTE_COUNTER_PREFIX)
    ]
    return plan


async def apply_wipe(db: Any, bucket: Any, plan: WipePlan) -> None:
    """Delete what the plan lists. Email records first (nothing is sent for a
    chat being deleted), the quote counters last (an interrupted run never
    resets the numbering while test quotes are left). Idempotent."""
    await delete_refs(db, plan.email)
    for pid in plan.chat_ids:
        await purge_project_storage(bucket, pid, [])
        await purge_projection(db, pid, [])
        await purge_session(db, pid)
    for refs in (plan.legal_holds, plan.usage_quotas, plan.leads, plan.guest_claim_tickets, plan.audit_logs):
        await delete_refs(db, refs)
    for ref in plan.chat_pointers:
        await ref.update({CHAT_ID: DELETE_FIELD, CHAT_ASSIGNED_AT: DELETE_FIELD})
    await delete_refs(db, plan.quote_counters)


def _short(chat_id: str) -> str:
    # A chat id is an access token for a guest: never print it whole.
    return f"{chat_id[:6]}…"


def _report(plan: WipePlan) -> None:
    print(f"Firebase project: {settings.GOOGLE_CLOUD_PROJECT}  bucket: {settings.FIREBASE_STORAGE_BUCKET}")
    print(f"Chats:            {len(plan.chat_ids)}  {', '.join(_short(pid) for pid in plan.chat_ids)}")
    for name, count in plan.counts().items():
        print(f"{name + ':':<18}{count}")
    if plan.skipped_ids:
        print(f"Malformed ids (left in place): {len(plan.skipped_ids)}")


async def _run(apply: bool) -> int:
    db, bucket = get_async_firestore_client(), get_storage_client()
    if not apply:
        _report(await plan_wipe(db, bucket))
        print("Dry run. Re-run with --apply to delete.")
        return 0
    async with lifecycle_lease(db):
        plan = await plan_wipe(db, bucket)
        _report(plan)
        await apply_wipe(db, bucket, plan)
    print("Deleted. Run the dry run again: it must find nothing.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="actually delete")
    args = parser.parse_args()
    return asyncio.run(_run(args.apply))


if __name__ == "__main__":
    raise SystemExit(main())
