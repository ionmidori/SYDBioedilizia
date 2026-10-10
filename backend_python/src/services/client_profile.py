"""
Who is the client behind a uid — name, email, phone (Phase 128).

Firebase Auth is the authority for email and display name; `users/{uid}`
holds the phone (saved by the chat `save_contact_phone` tool) and fallbacks.
Used by the quote dossier snapshot, the approval pipeline and the backfill.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime

from firebase_admin import auth as fb_auth
from starlette.concurrency import run_in_threadpool

from src.db.firebase_client import get_async_firestore_client
from src.schemas.quote import ClientSnapshot

logger = logging.getLogger(__name__)
# Logs carry no uid or contact data (CodeQL py/clear-text-logging).

GUEST_UID_PREFIX = "guest_"


@dataclass(frozen=True)
class ClientProfile:
    name: str = ""
    email: str = ""
    phone: str = ""
    # Firebase anonymous users and `guest_*` chat owners have no verified identity.
    is_guest: bool = False


async def get_client_profile(uid: str) -> ClientProfile:
    """Resolve contact data for `uid`. Never raises; missing fields are ""."""
    if not uid or uid.startswith(GUEST_UID_PREFIX):
        return ClientProfile(is_guest=True)

    name = email = phone = ""
    is_guest = False

    try:
        user_record = await run_in_threadpool(fb_auth.get_user, uid)
        email = user_record.email or ""
        name = user_record.display_name or ""
        # Anonymous Firebase users have no linked provider.
        is_guest = not user_record.provider_data
    except Exception as exc:  # noqa: BLE001 — profile lookup is best-effort by contract
        logger.warning("[ClientProfile] Firebase Auth lookup failed", extra={"error_type": type(exc).__name__})

    try:
        db = get_async_firestore_client()
        doc = await db.collection("users").document(uid).get()
        data = (doc.to_dict() or {}) if doc.exists else {}
        phone = data.get("phone") or ""
        name = name or data.get("displayName") or data.get("name") or ""
        email = email or data.get("email") or ""
    except Exception as exc:  # noqa: BLE001 — profile lookup is best-effort by contract
        logger.warning("[ClientProfile] Firestore lookup failed", extra={"error_type": type(exc).__name__})

    return ClientProfile(name=name, email=email, phone=phone, is_guest=is_guest and not email)


def build_client_snapshot(uid: str, profile: ClientProfile, now: datetime) -> ClientSnapshot:
    return ClientSnapshot(
        uid=uid,
        display_name=profile.name or None,
        email=profile.email or None,
        phone=profile.phone or None,
        is_guest=profile.is_guest,
        captured_at=now,
    )


def build_search_keys(quote_number: str | None, snapshot: ClientSnapshot | None) -> list[str]:
    """Lower-cased tokens for the admin inbox search (`array-contains`)."""
    keys: list[str] = []
    if quote_number:
        keys.append(quote_number.lower())
    if snapshot is not None:
        if snapshot.display_name:
            keys.extend(token for token in snapshot.display_name.lower().split() if len(token) > 1)
        if snapshot.email:
            keys.append(snapshot.email.lower())
    return list(dict.fromkeys(keys))
