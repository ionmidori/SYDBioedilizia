"""
Quota management system for rate-limiting expensive operations.

This module provides Firestore-based quota tracking to prevent API abuse
by limiting the number of renders and quotes per user per 24-hour window.
Mirrors the logic from ai_core/src/tool-quota.ts.

S2 FIX: Migrated from synchronous `firestore.client()` to async `get_async_firestore_client()`
        to prevent blocking the FastAPI main event loop.
S3 FIX: Quota is now tracked per-project (not per-user) to match business rules.
"""

import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Literal
from zoneinfo import ZoneInfo

from google.cloud.firestore_v1 import Increment, async_transactional
from src.core.config import settings
from src.core.exceptions import PermissionDenied, ServiceError
from src.core.exceptions import QuotaExceeded as _AppQuotaExceeded
from src.db.firebase_client import get_async_firestore_client
from src.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

# Quota limits - Tiered based on authentication
# Anonymous users: Access is now BLOCKED by AuthGuard (Tier 1).
QUOTA_LIMITS_ANONYMOUS = {
    "generate_render": 0,
    "get_market_prices": 0,
    "upload_video": 0,
    "save_quote": 0,
}

QUOTA_LIMITS_AUTHENTICATED = {
    "generate_render": 2,
    "get_market_prices": 2,
    "save_quote": 2,
    "upload_video": 1,
}

# Weekly limits (7 days rolling window)
QUOTA_LIMITS_WEEKLY = {
    "generate_render": 7
}

QUOTA_WINDOW_HOURS = 24
QUOTA_WINDOW_WEEKLY_HOURS = 24 * 7
# Sentinel for an unlimited daily quota — a large int (not float('inf')) so the
# remaining count stays int and JSON-serializable.
_UNLIMITED_QUOTA = 10 ** 9


# Firebase UIDs: 20-128 chars, alphanumeric plus dash/underscore
_FIREBASE_UID_RE = re.compile(r'^[a-zA-Z0-9_\-]{20,128}$')
_ANONYMOUS_PREFIXES = ("guest_", "session_", "anon_", "debug-")

def _is_authenticated_user(user_id: str) -> bool:
    """
    Check if user is authenticated based on user_id format.

    L4 FIX: Uses proper Firebase UID regex instead of fragile
    heuristics (isalnum, len>10). Firebase UIDs can contain
    dashes and underscores.
    """
    if not user_id or user_id == "default":
        return False
    if any(user_id.startswith(prefix) for prefix in _ANONYMOUS_PREFIXES):
        return False
    return bool(_FIREBASE_UID_RE.match(user_id))


QuotaPeriod = Literal["daily", "weekly"]


class QuotaReason(StrEnum):
    OK = "ok"
    LIMIT_REACHED = "limit_reached"  # the user used up the allowance
    NOT_AVAILABLE = "not_available"  # the account's tier does not include this feature (limit 0)
    UNAVAILABLE = "unavailable"      # the quota store could not answer (fail-closed)


@dataclass(frozen=True)
class QuotaDecision:
    """Outcome of a quota check.

    `reset_at` is when the allowance renews (LIMIT_REACHED) or when it is worth
    trying again (UNAVAILABLE). `period` says which window was exhausted.
    """

    allowed: bool
    remaining: int
    reset_at: datetime
    reason: QuotaReason = QuotaReason.OK
    period: QuotaPeriod | None = None


_ROME = ZoneInfo("Europe/Rome")

# What each metered tool is called in user-facing text.
_TOOL_LABELS = {
    "upload_video": "caricamenti video",
    "upload_image": "caricamenti foto",
    "generate_render": "render",
}
_PERIOD_LABELS = {"daily": "giornaliero", "weekly": "settimanale"}


def format_reset_it(reset_at: datetime, *, now: datetime | None = None) -> str:
    """When a quota renews, in Italian and in Rome time:
    "oggi dopo le 14:30", "domani dopo le 09:10", "il 23/10 dopo le 09:10".

    The day is judged in Rome, not in UTC, so late-evening resets say "domani".
    A naive datetime is read as UTC.
    """
    if reset_at.tzinfo is None:
        reset_at = reset_at.replace(tzinfo=UTC)
    local = reset_at.astimezone(_ROME)
    today = (now or utc_now()).astimezone(_ROME).date()
    days = (local.date() - today).days
    clock = f"dopo le {local:%H:%M}"
    if days <= 0:
        return f"oggi {clock}"
    if days == 1:
        return f"domani {clock}"
    return f"il {local:%d/%m} {clock}"


class QuotaExceededError(_AppQuotaExceeded):
    """Raised when a user exceeds their quota for a specific tool.

    Extends AppException (status 429) so the global exception handler
    returns a proper APIErrorResponse (with Retry-After) instead of a raw 500.
    """

    def __init__(
        self,
        tool_name: str,
        reset_at: datetime,
        period: QuotaPeriod = "daily",
        *,
        now: datetime | None = None,
    ):
        self.tool_name = tool_name
        self.reset_at = reset_at
        self.period = period
        label = _TOOL_LABELS.get(tool_name, tool_name)
        super().__init__(
            message=(
                f"Hai raggiunto il limite {_PERIOD_LABELS[period]} di {label}. "
                f"Riprova {format_reset_it(reset_at, now=now)}."
            ),
            detail={
                "tool_name": tool_name,
                "reset_at": reset_at.isoformat(),
                "period": period,
            },
        )


class QuotaNotAvailableError(PermissionDenied):
    """The feature is not part of this account's tier (limit 0): a 403, with no
    reset time — waiting does not help."""

    error_code = "FEATURE_NOT_AVAILABLE"

    def __init__(self, tool_name: str):
        self.tool_name = tool_name
        super().__init__(
            message="Questa funzione non è disponibile per il tuo account.",
            detail={"tool_name": tool_name},
        )


class QuotaUnavailableError(ServiceError):
    """The quota store could not answer, so the operation is refused (fail-closed).

    A 503 with the retry time — not a 500, and not a fake "limit reached".
    """

    status_code = 503
    error_code = "QUOTA_UNAVAILABLE"

    def __init__(self, tool_name: str, retry_at: datetime):
        self.tool_name = tool_name
        self.retry_at = retry_at
        super().__init__(
            message="Verifica della quota momentaneamente non disponibile. Riprova tra qualche minuto.",
            detail={"tool_name": tool_name, "reset_at": retry_at.isoformat()},
        )


def _build_quota_doc_id(user_id: str, tool_name: str, project_id: str | None = None) -> str:
    """
    S3 FIX: Build quota document ID. Uses project_id when available
    for per-project quota tracking (matching business rules).
    Falls back to user_id for backward compatibility.
    """
    scope_id = project_id if project_id else user_id
    return f"{scope_id}_{tool_name}"


async def check_quota(
    user_id: str,
    tool_name: str,
    project_id: str | None = None
) -> QuotaDecision:
    """
    Check if the user has remaining quota for the specified tool.
    Supports Daily + Weekly limits and Administrator Overrides.

    S2 FIX: Now fully async using get_async_firestore_client().
    S3 FIX: Quota tracked per-project when project_id is provided.

    Args:
        user_id: Firebase UID.
        tool_name: Name of the tool to check quota for.
        project_id: Optional project/session ID for per-project tracking.

    Returns:
        A QuotaDecision. When the quota store cannot answer, the decision denies
        the operation (fail-closed) with reason UNAVAILABLE — distinct from a
        genuinely exhausted allowance (LIMIT_REACHED).
    """
    now = utc_now()

    # ENVIRONMENT OVERRIDE: Unlimited quota in development
    if settings.ENV == "development":
        logging.info(f"[Quota] Dev mode active: Bypassing quota for {tool_name}")
        return QuotaDecision(True, 9999, now + timedelta(days=365))

    try:
        db = get_async_firestore_client()
        doc_id = _build_quota_doc_id(user_id, tool_name, project_id)
        quota_ref = db.collection("usage_quotas").document(doc_id)
        doc = await quota_ref.get()

        # Override Logic
        custom_limit = None
        if doc.exists:
            data = doc.to_dict() or {}
            if data.get("bypass_quota") is True:
                logger.info(f"[Quota] 🛑 BYPASS ACTIVE for {doc_id} on {tool_name}")
                return QuotaDecision(True, 9999, now + timedelta(days=365))

            override_limit = data.get("override_limit")
            if override_limit is not None:
                custom_limit = int(override_limit)
                logger.info(f"[Quota] 🔧 CUSTOM LIMIT ACTIVE for {doc_id}: {custom_limit}")

        # Determine limits
        is_authenticated = _is_authenticated_user(user_id)
        limits = QUOTA_LIMITS_AUTHENTICATED if is_authenticated else QUOTA_LIMITS_ANONYMOUS
        # "Unlimited" is a large int sentinel (not float('inf')) so the remaining
        # count stays int end-to-end and JSON-serializable (Infinity is invalid JSON).
        daily_limit = custom_limit if custom_limit is not None else limits.get(tool_name, _UNLIMITED_QUOTA)
        weekly_limit = QUOTA_LIMITS_WEEKLY.get(tool_name)

        if daily_limit <= 0:
            # Not part of this tier (or blocked by an admin override): waiting
            # never helps, so this is not a "limit reached".
            return QuotaDecision(False, 0, now + timedelta(hours=QUOTA_WINDOW_HOURS), QuotaReason.NOT_AVAILABLE)

        logger.info(
            f"[Quota] Checking {doc_id} ({'auth' if is_authenticated else 'anon'}) "
            f"for {tool_name}. Limit: {daily_limit}/day, {weekly_limit}/week"
        )

        # Check weekly limit (if applicable)
        if weekly_limit:
            weekly_doc_id = f"{doc_id}_weekly"
            weekly_ref = db.collection("usage_quotas").document(weekly_doc_id)
            weekly_doc = await weekly_ref.get()

            if weekly_doc.exists:
                w_data = weekly_doc.to_dict() or {}
                w_count = w_data.get("count", 0)
                w_start = w_data.get("window_start")
                if w_start is not None and hasattr(w_start, 'timestamp'):
                    w_start = datetime.fromtimestamp(w_start.timestamp(), tz=UTC)

                # A malformed doc may lack window_start; skip the weekly check then
                # (mirrors the daily-path `if not window_start` handling below).
                if w_start is not None and now < w_start + timedelta(hours=QUOTA_WINDOW_WEEKLY_HOURS):
                    if w_count >= weekly_limit and custom_limit is None:
                         reset_at = w_start + timedelta(hours=QUOTA_WINDOW_WEEKLY_HOURS)
                         logger.warning(f"[Quota] Weekly limit reached for {doc_id}")
                         return QuotaDecision(False, 0, reset_at, QuotaReason.LIMIT_REACHED, "weekly")

        def _fresh_window() -> QuotaDecision:
            # No usage in the current window: the first use is allowed.
            return QuotaDecision(True, daily_limit - 1, now + timedelta(hours=QUOTA_WINDOW_HOURS))

        # Check daily limit
        if not doc.exists:
            return _fresh_window()

        data = doc.to_dict() or {}
        count = data.get("count", 0)
        window_start = data.get("window_start")

        if not window_start:
            return QuotaDecision(True, daily_limit - 1, now + timedelta(hours=QUOTA_WINDOW_HOURS))

        if hasattr(window_start, 'timestamp'):
            window_start = datetime.fromtimestamp(window_start.timestamp(), tz=UTC)

        if now >= window_start + timedelta(hours=QUOTA_WINDOW_HOURS):
            return _fresh_window()

        # Window active
        reset_at = window_start + timedelta(hours=QUOTA_WINDOW_HOURS)
        remaining = max(0, daily_limit - count)
        allowed = count < daily_limit

        if not allowed:
            logger.warning(
                f"[Quota] Daily limit reached for {doc_id} ({count}/{daily_limit})"
            )
            return QuotaDecision(False, remaining, reset_at, QuotaReason.LIMIT_REACHED, "daily")

        return QuotaDecision(True, remaining, reset_at)

    except Exception as e:
        # SECURITY: fail-closed — deny operations during Firestore outages
        # to prevent quota bypass. Monitor this log for connectivity issues.
        logger.critical(f"[Quota] Firestore error in check_quota (FAIL-CLOSED): {e}", exc_info=True)
        return QuotaDecision(False, 0, now + timedelta(minutes=5), QuotaReason.UNAVAILABLE)


def quota_denial(
    tool_name: str, decision: QuotaDecision
) -> QuotaExceededError | QuotaNotAvailableError | QuotaUnavailableError:
    """The error for a denied decision (its `.message` is the user-facing text,
    shared by HTTP endpoints and agent tools)."""
    if decision.reason is QuotaReason.UNAVAILABLE:
        return QuotaUnavailableError(tool_name, decision.reset_at)
    if decision.reason is QuotaReason.NOT_AVAILABLE:
        return QuotaNotAvailableError(tool_name)
    return QuotaExceededError(tool_name, decision.reset_at, decision.period or "daily")


async def enforce_quota(user_id: str, tool_name: str, project_id: str | None = None) -> QuotaDecision:
    """check_quota, raising for a denial so an endpoint can let it reach the
    global handler: QuotaExceededError (429) when the allowance is used up,
    QuotaUnavailableError (503) when the quota store could not answer.
    """
    decision = await check_quota(user_id, tool_name, project_id)
    if not decision.allowed:
        raise quota_denial(tool_name, decision)
    return decision


async def increment_quota(
    user_id: str,
    tool_name: str,
    project_id: str | None = None
) -> None:
    """
    Increment the quota counter (Daily + Weekly).

    S2 FIX: Now fully async.
    S3 FIX: Tracks per-project when project_id is provided.
    """
    db = get_async_firestore_client()
    doc_id = _build_quota_doc_id(user_id, tool_name, project_id)

    # Update Daily Quota
    daily_ref = db.collection("usage_quotas").document(doc_id)
    await _increment_counter(db, daily_ref, user_id, tool_name, QUOTA_WINDOW_HOURS, project_id)

    # Update Weekly Quota (if applicable)
    if tool_name in QUOTA_LIMITS_WEEKLY:
        weekly_ref = db.collection("usage_quotas").document(f"{doc_id}_weekly")
        await _increment_counter(db, weekly_ref, user_id, tool_name, QUOTA_WINDOW_WEEKLY_HOURS, project_id)


async def _increment_counter(
    db,
    doc_ref,
    user_id: str,
    tool_name: str,
    window_hours: int,
    project_id: str | None = None
) -> None:
    """
    Atomic counter increment using Firestore server-side Increment + transactions.

    Two-path strategy:
    - Active window  → Increment() (server-side atomic, no transaction overhead)
    - Expired/absent → Firestore transaction to prevent the window-reset race where
      two concurrent requests both see the window as expired and both reset to count=1,
      under-counting one request. With a transaction, the second request detects that
      the first already reset the window and increments instead.
    """
    try:
        now = utc_now()
        snapshot = await doc_ref.get()

        # Fast path: window is still active — Increment() is inherently atomic
        if snapshot.exists:
            data = snapshot.to_dict()
            window_start = data.get("window_start")
            if hasattr(window_start, 'timestamp'):
                window_start = datetime.fromtimestamp(window_start.timestamp(), tz=UTC)
            if window_start and now < window_start + timedelta(hours=window_hours):
                await doc_ref.update({"count": Increment(1), "last_used": now})
                return

        # Slow path: window expired or doc absent — use transaction to prevent
        # the read-then-write race condition on window reset.
        @async_transactional
        async def _atomic_reset_or_create(transaction):
            snap = await doc_ref.get(transaction=transaction)
            if not snap.exists:
                transaction.set(doc_ref, {
                    "count": 1,
                    "window_start": now,
                    "user_id": user_id,
                    "project_id": project_id,
                    "tool_name": tool_name,
                    "last_used": now,
                    "expireAt": now + timedelta(days=30),
                })
                return
            d = snap.to_dict()
            ws = d.get("window_start")
            if hasattr(ws, 'timestamp'):
                ws = datetime.fromtimestamp(ws.timestamp(), tz=UTC)
            if ws and now < ws + timedelta(hours=window_hours):
                # A concurrent request already reset the window — just increment
                transaction.update(doc_ref, {"count": Increment(1), "last_used": now})
            else:
                # Still expired: reset with count=1
                transaction.update(doc_ref, {
                    "count": 1,
                    "window_start": now,
                    "last_used": now,
                    "project_id": project_id,
                    "expireAt": now + timedelta(days=30),
                })

        await _atomic_reset_or_create(db.transaction())

    except Exception as e:  # noqa: BLE001
        logger.error(f"[Quota] Error incrementing {tool_name} for {user_id}: {e}")
