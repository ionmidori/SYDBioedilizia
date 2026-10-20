"""Firebase Auth operations used by the erasure and the account lifecycle.

The Admin SDK is synchronous: every call runs in a worker thread. A missing
account is not an error (erasure steps must be repeatable); any other failure
propagates, so a step is retried instead of being reported as done.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Protocol

from firebase_admin import auth

from src.db.firebase_client import init_firebase


@dataclass(frozen=True)
class AuthContact:
    email: str | None
    display_name: str | None


class AuthGateway(Protocol):
    async def disable_and_revoke(self, uid: str) -> bool: ...
    async def delete_user(self, uid: str) -> bool: ...
    async def get_contact(self, uid: str) -> AuthContact | None: ...


class FirebaseAuthGateway:
    async def disable_and_revoke(self, uid: str) -> bool:
        """Disable the account and revoke its refresh tokens: from now on the
        backend (verify_token, check_revoked=True) refuses its requests.
        False if the account does not exist."""
        init_firebase()

        def _run() -> None:
            auth.update_user(uid, disabled=True)
            auth.revoke_refresh_tokens(uid)

        try:
            await asyncio.to_thread(_run)
        except auth.UserNotFoundError:
            return False
        return True

    async def delete_user(self, uid: str) -> bool:
        """Delete the account; False if it was already gone."""
        init_firebase()
        try:
            await asyncio.to_thread(auth.delete_user, uid)
        except auth.UserNotFoundError:
            return False
        return True

    async def get_contact(self, uid: str) -> AuthContact | None:
        """Email and display name kept by Firebase Auth (the `users` document
        does not store them)."""
        init_firebase()
        try:
            user = await asyncio.to_thread(auth.get_user, uid)
        except auth.UserNotFoundError:
            return None
        return AuthContact(email=user.email, display_name=user.display_name)
