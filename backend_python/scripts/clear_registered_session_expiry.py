"""Stop the 30-day TTL from deleting registered users' projects: WRITES to live Firestore.

Until the fix that made only guest sessions expire, every chat write renewed
`expireAt` (+30 days) on the session and on each message, for every user, and the
Firestore TTL policies on `sessions`/`messages` delete documents past it. This
removes `expireAt` from each session owned by a registered account, and from its
messages (src/db/session_retention.py: backfill_registered_sessions).

Guest sessions (guest_* owner, anonymous account, no owner) keep their expiry.
Sessions of accounts that no longer exist are only reported. A Firebase Auth
lookup error stops the run: nothing is guessed.

It writes to whatever project the credentials in `.env` point at (including
production). Without `--apply` it only reports what it would change.

Usage (from backend_python/):
    uv run python scripts/clear_registered_session_expiry.py            # dry run
    uv run python scripts/clear_registered_session_expiry.py --apply    # write
"""
import argparse
import asyncio
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Make `src` importable from any cwd: this file lives in backend_python/scripts/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.auth.user_lookup import account_kind  # noqa: E402
from src.db.firebase_client import get_async_firestore_client  # noqa: E402
from src.db.session_retention import backfill_registered_sessions  # noqa: E402


async def _run(apply: bool) -> int:
    report = await backfill_registered_sessions(get_async_firestore_client(), account_kind, apply=apply)
    verb = "Made permanent" if apply else "Would make permanent"
    print(f"Sessions scanned:            {report.scanned}")
    print(f"{verb + ':':<29}{report.made_permanent} sessions, {report.messages} messages")
    print(f"Guest sessions (kept):       {report.guest}")
    print(f"Owner account gone (kept):   {report.orphaned}")
    if not apply:
        print("Dry run. Re-run with --apply to write.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="actually remove expireAt")
    args = parser.parse_args()
    return asyncio.run(_run(args.apply))


if __name__ == "__main__":
    raise SystemExit(main())
