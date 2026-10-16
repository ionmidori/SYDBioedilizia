"""
Server-side identity checks for code paths that only have a verified uid
(e.g. ADK tools, which receive the uid of the ADK session but not the JWT).
"""

import asyncio
import logging
from enum import StrEnum

from firebase_admin import auth
from src.db.firebase_client import init_firebase

logger = logging.getLogger(__name__)


class AccountKind(StrEnum):
    REGISTERED = "registered"  # at least one sign-in provider linked
    ANONYMOUS = "anonymous"    # Firebase anonymous sign-in (guest)
    MISSING = "missing"        # no such account (deleted, or never existed)


async def account_kind(uid: str) -> AccountKind:
    """What kind of Firebase account `uid` is.

    A Firebase anonymous uid has the same shape as a regular one, so the uid
    alone cannot tell them apart: ask Firebase Auth. Never guesses: lookup
    errors other than "not found" propagate, so callers choose their own
    failure policy.
    """
    if not uid:
        return AccountKind.MISSING
    init_firebase()  # outside the try: a setup ValueError is not "account missing"
    try:
        user = await asyncio.to_thread(auth.get_user, uid)
    except (auth.UserNotFoundError, ValueError):  # ValueError: malformed uid
        return AccountKind.MISSING
    return AccountKind.REGISTERED if user.provider_data else AccountKind.ANONYMOUS


async def is_anonymous_user(uid: str) -> bool:
    """True unless `uid` is a registered account (guest, missing or unknown).

    Fails closed — any lookup error counts as anonymous, so premium tools stay
    locked.
    """
    try:
        kind = await account_kind(uid)
    except Exception:
        logger.error("[Auth] Firebase user lookup failed — treating user as anonymous", exc_info=True)
        return True
    return kind is not AccountKind.REGISTERED
