"""Move a guest's chats to the user's account: WRITES to live Firestore. One-off.

For a guest who signed in to an existing account before the guest claim
existed (Phase 138 PR-6): the claim needs a ticket the anonymous user can no
longer ask for, so an operator moves the chats on the user's behalf. It moves
EVERY session of the anonymous account that owns `--session-id`, with the same
routine as the claim (src/services/guest_claim/transfer.py): sessions,
projections, files, quote owner, guest expiry removed.

Refuses unless the session's owner is an anonymous account and the target a
registered one. Without `--apply` it only reports what it would move.
Remove this script once the recovery is done.

Usage (from backend_python/):
    uv run python scripts/recover_guest_session.py --session-id <id> --to-email <email>           # dry run
    uv run python scripts/recover_guest_session.py --session-id <id> --to-uid <uid> --apply      # write
"""
import argparse
import asyncio
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Make `src` importable from any cwd: this file lives in backend_python/scripts/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from firebase_admin import auth  # noqa: E402
from src.auth.user_lookup import AccountKind, account_kind  # noqa: E402
from src.db.firebase_client import get_async_firestore_client, init_firebase  # noqa: E402
from src.services.guest_claim.transfer import count_contents, find_guest_sessions, move_session  # noqa: E402


async def _target_uid(uid: str | None, email: str | None) -> str | None:
    if uid:
        return uid
    init_firebase()
    try:
        user = await asyncio.to_thread(auth.get_user_by_email, email)
    except auth.UserNotFoundError:
        return None
    return user.uid


async def _run(session_id: str, to_uid: str | None, to_email: str | None, apply: bool) -> int:
    db = get_async_firestore_client()
    session = await db.collection("sessions").document(session_id).get()
    if not session.exists:
        print(f"Session {session_id} not found.")
        return 1
    owner = (session.to_dict() or {}).get("userId") or ""
    owner_kind = await account_kind(owner)
    if owner_kind is not AccountKind.ANONYMOUS:
        print(f"Session owner {owner!r} is {owner_kind.value}, not anonymous: nothing to recover.")
        return 1

    target = await _target_uid(to_uid, to_email)
    if target is None:
        print(f"No account with email {to_email!r}.")
        return 1
    target_kind = await account_kind(target)
    if target_kind is not AccountKind.REGISTERED:
        print(f"Target {target!r} is {target_kind.value}, not a registered account.")
        return 1
    record = await asyncio.to_thread(auth.get_user, target)

    found = await find_guest_sessions(db, owner)
    contents = await count_contents(db, found, owner)
    print(f"From anonymous account:  {owner}")
    print(f"To account:              {target} ({record.email or 'no email'})")
    print(f"Sessions:                {', '.join(found.session_ids) or '-'}")
    print(f"Most recent (live):      {found.open_session_id or '-'}")
    print(f"Messages:                {contents.messages}")
    print(f"Files (uploadedBy):      {contents.files}")
    print(f"Rooms:                   {contents.rooms}")
    print(f"Quotes:                  {contents.quotes}")
    if not apply:
        print("Dry run. Re-run with --apply to write.")
        return 0
    for session_id in found.session_ids:
        await move_session(db, session_id, owner, target)
        print(f"Moved {session_id}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--session-id", required=True, help="a session of the guest (its owner is the anonymous uid)")
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--to-uid", help="uid of the user's registered account")
    target.add_argument("--to-email", help="email of the user's registered account")
    parser.add_argument("--apply", action="store_true", help="actually move the sessions")
    args = parser.parse_args()
    return asyncio.run(_run(args.session_id, args.to_uid, args.to_email, args.apply))


if __name__ == "__main__":
    raise SystemExit(main())
