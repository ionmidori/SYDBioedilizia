"""
AccountLifecycleService — GDPR B2C inactivity lifecycle for Italian SaaS.

3-phase automatic pipeline triggered by Cloud Scheduler (daily):

  Phase 1 — 12 months inactive  → Warning email (once). Sets lifecycle_warned_at.
  Phase 2 — 13 months inactive  → Firebase Auth disabled. Sets lifecycle_disabled_at.
  Phase 3 — 24 months inactive  → Firestore PII anonymized (GDPR Art. 5 minimization).
                                   Firebase Auth account deleted.

Each phase is idempotent: already-processed users are skipped via lifecycle_* timestamps.
Users who log in between phases reset last_active_at via activity_tracker.py → pipeline exits.

Pattern: Service Layer (no HTTP logic), python-production-coding (structured logging).
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
from dataclasses import dataclass, field
from datetime import timezone
from typing import Optional

from src.core.config import settings
from src.db.firebase_client import get_async_firestore_client
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)


# ── Domain types ──────────────────────────────────────────────────────────────

@dataclass
class LifecycleRunResult:
    """Summary of a single lifecycle pass."""
    warned: int = 0
    disabled: int = 0
    anonymized: int = 0
    errors: list[str] = field(default_factory=list)

    def __str__(self) -> str:  # pragma: no cover
        return (
            f"LifecycleRun: warned={self.warned}, disabled={self.disabled}, "
            f"anonymized={self.anonymized}, errors={len(self.errors)}"
        )


# ── Service ───────────────────────────────────────────────────────────────────

class AccountLifecycleService:
    """
    GDPR-compliant inactivity lifecycle for SYD Bioedilizia users.

    All phases are idempotent and non-destructive until Phase 3.
    Phase 3 anonymization is irreversible — data can never be recovered.
    """

    def __init__(self) -> None:
        self._warn_months: int = settings.LIFECYCLE_WARN_MONTHS
        self._disable_months: int = settings.LIFECYCLE_DISABLE_MONTHS
        self._anonymize_months: int = settings.LIFECYCLE_ANONYMIZE_MONTHS

    # ── Public entry point ────────────────────────────────────────────────────

    async def run_lifecycle_pass(self) -> LifecycleRunResult:
        """
        Runs all 3 lifecycle phases in parallel and returns a summary.

        Safe to run multiple times (idempotent). Designed for daily Cloud Scheduler calls.
        """
        result = LifecycleRunResult()

        phase1, phase2, phase3 = await asyncio.gather(
            self._phase_warn(result),
            self._phase_disable(result),
            self._phase_anonymize(result),
            return_exceptions=True,
        )

        for exc in (phase1, phase2, phase3):
            if isinstance(exc, Exception):
                logger.error("[Lifecycle] Phase failed: %s", exc, exc_info=True)
                result.errors.append(str(exc))

        logger.info("[Lifecycle] Pass complete: %s", result)
        return result

    # ── Phase 1: Warning ──────────────────────────────────────────────────────

    async def _phase_warn(self, result: LifecycleRunResult) -> None:
        """
        Finds users inactive ≥ LIFECYCLE_WARN_MONTHS who have NOT yet been warned.
        Sends a warning email via NotificationService and sets lifecycle_warned_at.
        """
        from src.services.notification_service import NotificationService
        notify = NotificationService()

        threshold = _months_ago(self._warn_months)
        db = get_async_firestore_client()

        query = (
            db.collection("users")
            .where("last_active_at", "<=", threshold)
            .where("lifecycle_warned_at", "==", None)
        )

        async for doc in query.stream():
            uid = doc.id
            data = doc.to_dict() or {}
            email = data.get("email")

            if not email:
                logger.warning("[Lifecycle/Warn] uid=%s has no email — skipping", uid)
                continue

            try:
                await notify.send_inactivity_warning(
                    email=email,
                    display_name=data.get("display_name") or "Utente",
                    disable_in_days=int((self._disable_months - self._warn_months) * 30),
                )
                await doc.reference.update({"lifecycle_warned_at": utc_now()})
                result.warned += 1
                logger.info("[Lifecycle/Warn] Warning sent to uid=%s", uid)
            except Exception as exc:
                logger.error("[Lifecycle/Warn] Failed for uid=%s: %s", uid, exc)
                result.errors.append(f"warn:{uid}:{exc}")

    # ── Phase 2: Disable ──────────────────────────────────────────────────────

    async def _phase_disable(self, result: LifecycleRunResult) -> None:
        """
        Finds warned users inactive ≥ LIFECYCLE_DISABLE_MONTHS.
        Disables Firebase Auth account (reversible). Sets lifecycle_disabled_at.
        """
        threshold = _months_ago(self._disable_months)
        db = get_async_firestore_client()

        query = (
            db.collection("users")
            .where("last_active_at", "<=", threshold)
            .where("lifecycle_warned_at", "!=", None)
            .where("lifecycle_disabled_at", "==", None)
        )

        async for doc in query.stream():
            uid = doc.id
            try:
                await asyncio.get_event_loop().run_in_executor(
                    None, _disable_firebase_auth, uid
                )
                await doc.reference.update({"lifecycle_disabled_at": utc_now()})
                result.disabled += 1
                logger.info("[Lifecycle/Disable] Firebase Auth disabled for uid=%s", uid)
            except Exception as exc:
                logger.error("[Lifecycle/Disable] Failed for uid=%s: %s", uid, exc)
                result.errors.append(f"disable:{uid}:{exc}")

    # ── Phase 3: Anonymize ────────────────────────────────────────────────────

    async def _phase_anonymize(self, result: LifecycleRunResult) -> None:
        """
        Finds disabled users inactive ≥ LIFECYCLE_ANONYMIZE_MONTHS.
        Anonymizes PII in Firestore (GDPR Art. 5 data minimization).
        Deletes Firebase Auth account (permanent).
        Sets lifecycle_anonymized_at.

        What is anonymized:
          - email      → sha256(email)@anonymized.local  (pseudonymous, not recoverable)
          - display_name → "Utente Anonimizzato"
          - phone      → null
          - All chat sessions + messages deleted
          - All quote private_data deleted
          - Firebase Auth account deleted

        What is kept (non-PII aggregate):
          - uid, created_at, last_active_at, lifecycle_* timestamps
        """
        threshold = _months_ago(self._anonymize_months)
        db = get_async_firestore_client()

        query = (
            db.collection("users")
            .where("last_active_at", "<=", threshold)
            .where("lifecycle_disabled_at", "!=", None)
            .where("lifecycle_anonymized_at", "==", None)
        )

        async for doc in query.stream():
            uid = doc.id
            data = doc.to_dict() or {}
            try:
                await self._anonymize_user(uid, data, db)
                result.anonymized += 1
                logger.info("[Lifecycle/Anonymize] PII anonymized for uid=%s", uid)
            except Exception as exc:
                logger.error("[Lifecycle/Anonymize] Failed for uid=%s: %s", uid, exc)
                result.errors.append(f"anonymize:{uid}:{exc}")

    async def _anonymize_user(self, uid: str, data: dict, db) -> None:
        """Performs the irreversible PII anonymization for a single user."""
        now = utc_now()

        # ── Anonymize Firestore user profile ──────────────────────────────────
        email = data.get("email") or ""
        anonymized_email = (
            hashlib.sha256(email.encode()).hexdigest() + "@anonymized.local"
            if email else "unknown@anonymized.local"
        )
        await db.collection("users").document(uid).set(
            {
                "email": anonymized_email,
                "display_name": "Utente Anonimizzato",
                "phone": None,
                "lifecycle_anonymized_at": now,
            },
            merge=True,
        )

        # ── Delete user preferences subcollection ─────────────────────────────
        prefs_ref = db.collection("users").document(uid).collection("preferences").document("general")
        await prefs_ref.delete()

        # ── Delete all chat sessions + messages ───────────────────────────────
        async for session_doc in db.collection("sessions").where("userId", "==", uid).stream():
            async for msg_doc in session_doc.reference.collection("messages").stream():
                await msg_doc.reference.delete()
            await session_doc.reference.delete()

        # ── Delete private quote data from projects (keep project shell) ──────
        async for project_doc in db.collection("projects").where("userId", "==", uid).stream():
            quote_ref = project_doc.reference.collection("private_data").document("quote")
            await quote_ref.delete()

        # ── Delete Firebase Auth account ──────────────────────────────────────
        try:
            await asyncio.get_event_loop().run_in_executor(
                None, _delete_firebase_auth, uid
            )
        except Exception as exc:
            # Non-fatal: profile is already anonymized; log for manual cleanup
            logger.warning("[Lifecycle/Anonymize] Auth deletion failed for uid=%s: %s", uid, exc)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _months_ago(months: int):
    """Returns a UTC datetime N months in the past (approx 30 days/month)."""
    from datetime import timedelta
    return utc_now() - timedelta(days=months * 30)


def _disable_firebase_auth(uid: str) -> None:
    """Sync: disables Firebase Auth user (reversible)."""
    import firebase_admin.auth as fb_auth
    fb_auth.update_user(uid, disabled=True)


def _delete_firebase_auth(uid: str) -> None:
    """Sync: permanently deletes Firebase Auth user."""
    import firebase_admin.auth as fb_auth
    fb_auth.delete_user(uid)


# ── Singleton factory ─────────────────────────────────────────────────────────

_service: Optional[AccountLifecycleService] = None


def get_account_lifecycle_service() -> AccountLifecycleService:
    global _service
    if _service is None:
        _service = AccountLifecycleService()
    return _service
