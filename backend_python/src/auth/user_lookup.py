"""
Server-side identity checks for code paths that only have a verified uid
(e.g. ADK tools, which receive the uid of the ADK session but not the JWT).
"""

import asyncio
import logging

from firebase_admin import auth
from src.db.firebase_client import init_firebase

logger = logging.getLogger(__name__)


async def is_anonymous_user(uid: str) -> bool:
    """True if the Firebase account has no sign-in provider linked (guest).

    A Firebase anonymous uid has the same shape as a regular one, so the uid
    alone cannot tell them apart: ask Firebase Auth. Fails closed — any lookup
    error counts as anonymous, so premium tools stay locked.
    """
    if not uid:
        return True
    try:
        init_firebase()
        user = await asyncio.to_thread(auth.get_user, uid)
    except (auth.UserNotFoundError, ValueError):
        return True
    except Exception:
        logger.error("[Auth] Firebase user lookup failed — treating user as anonymous", exc_info=True)
        return True
    return not user.provider_data
