"""
Admin authorisation — the single source of truth for "is this caller an admin".

Admins are Firebase users with the custom claim `role=admin` (set with
`scripts/set_admin_claim.py`). The Next.js `/admin` area only hides UI; every
admin capability is enforced here, server-side.

With `ADMIN_REQUIRE_MFA=true` the ID token must also prove a second factor
(`firebase.sign_in_second_factor`, set by Identity Platform MFA).
"""
from __future__ import annotations

from typing import Any

from fastapi import Depends
from src.auth.jwt_handler import verify_token
from src.core.config import settings
from src.core.exceptions import AdminRequiredError, AuthError
from src.schemas.internal import UserSession

ADMIN_ROLE = "admin"


def has_admin_role(user_session: UserSession) -> bool:
    return user_session.claims.get("role") == ADMIN_ROLE


def has_second_factor(claims: dict[str, Any]) -> bool:
    firebase_claims = claims.get("firebase")
    if not isinstance(firebase_claims, dict):
        return False
    return bool(firebase_claims.get("sign_in_second_factor"))


def ensure_admin(user_session: UserSession) -> UserSession:
    """Raise unless the session is a (non-anonymous) admin, with MFA if required."""
    if not user_session.is_authenticated or user_session.is_anonymous:
        raise AuthError("Authentication required.")
    if not has_admin_role(user_session):
        raise AdminRequiredError()
    if settings.ADMIN_REQUIRE_MFA and not has_second_factor(user_session.claims):
        raise AdminRequiredError("Multi-factor authentication is required for admin actions.")
    return user_session


async def require_admin(user_session: UserSession = Depends(verify_token)) -> UserSession:
    """FastAPI dependency for every `/api/admin/*` route."""
    return ensure_admin(user_session)
