"""
Grant or revoke the admin role (Firebase custom claim `role=admin`) — Phase 128.

The /admin console and every /api/admin route trust ONLY this claim (checked
server-side by src/auth/admin.py). Existing custom claims are preserved: the
role is merged in, never written over the whole claim map.

After a change the user's refresh tokens are revoked, so the new role (or its
removal) applies at the next sign-in instead of up to an hour later. The user
must sign out and in again. Every change is written to `audit_logs`.

Usage:
    cd backend_python && uv run python scripts/set_admin_claim.py --email admin@example.com --dry-run
    cd backend_python && uv run python scripts/set_admin_claim.py --email admin@example.com
    cd backend_python && uv run python scripts/set_admin_claim.py --email admin@example.com --revoke
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

from firebase_admin import auth  # noqa: E402
from src.db.firebase_client import get_async_firestore_client, init_firebase  # noqa: E402
from src.utils.datetime_utils import utc_now  # noqa: E402

ADMIN_ROLE = "admin"


def plan_claims(current: dict[str, Any] | None, revoke: bool) -> dict[str, Any]:
    """New claim map: role added or removed, every other claim kept."""
    claims = dict(current or {})
    if revoke:
        if claims.get("role") == ADMIN_ROLE:
            claims.pop("role")
    else:
        claims["role"] = ADMIN_ROLE
    return claims


def grant_refusal(email_verified: bool, has_provider: bool, revoke: bool) -> str | None:
    """Why granting must be refused, or None. Revoking is always allowed.

    The account is found BY EMAIL: without a verified email, anyone could have
    registered with the admin's address (email/password sign-up) and would
    receive the role. Only a verified owner of the address may be granted it.
    """
    if revoke:
        return None
    if not has_provider:
        return "Anonymous account: refusing to grant a role."
    if not email_verified:
        return (
            "The email of this account is NOT verified: refusing to grant the admin role "
            "(anyone can sign up with an address they do not own). Verify it first."
        )
    return None


async def _audit(uid: str, action: str, operator: str) -> None:
    db = get_async_firestore_client()
    await db.collection("audit_logs").add(
        {
            "action": action,
            "resource_type": "user",
            "resource_id": uid,
            "status": "success",
            "user_id": operator,
            "metadata": {"via": "scripts/set_admin_claim.py"},
            "timestamp": utc_now(),
        }
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", required=True)
    parser.add_argument("--revoke", action="store_true", help="remove the admin role")
    parser.add_argument("--dry-run", action="store_true", help="show the change, write nothing")
    parser.add_argument("--operator", default="cli", help="who runs the change (stored in the audit log)")
    args = parser.parse_args()

    init_firebase()
    try:
        user = auth.get_user_by_email(args.email)
    except auth.UserNotFoundError:
        sys.exit(f"No Firebase user with email {args.email}: the person must sign up on the site first.")
    if user.disabled:
        sys.exit("The account is disabled: refusing to change its role.")
    refusal = grant_refusal(user.email_verified, bool(user.provider_data), args.revoke)
    if refusal:
        sys.exit(refusal)

    current = dict(user.custom_claims or {})
    new = plan_claims(current, args.revoke)
    print(f"user:    {user.uid} (email verified: {user.email_verified})")
    print(f"claims:  {current} -> {new}")
    if new == current:
        print("Nothing to change.")
        return
    if args.dry_run:
        print("DRY RUN (nothing written)")
        return

    auth.set_custom_user_claims(user.uid, new)
    auth.revoke_refresh_tokens(user.uid)
    action = "admin.role_revoke" if args.revoke else "admin.role_grant"
    asyncio.run(_audit(user.uid, action, args.operator))
    print(f"Done ({action}). The user must sign out and sign in again for the change to apply.")


if __name__ == "__main__":
    main()
