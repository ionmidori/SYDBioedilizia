"""Quota decisions, the errors they raise and the Italian "when" wording.

A quota that is used up is a 429 with the reset time; a quota service that cannot
answer is a 503 (retry shortly) — never a 500 and never a fake "limit reached".
"""
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from src.core.exceptions import PermissionDenied, QuotaExceeded, ServiceError
from src.tools import quota
from src.tools.quota import (
    QuotaDecision,
    QuotaExceededError,
    QuotaNotAvailableError,
    QuotaReason,
    QuotaUnavailableError,
    check_quota,
    enforce_quota,
    format_reset_it,
    quota_denial,
)
from src.utils.datetime_utils import utc_now

# 2026-10-16 is CEST (UTC+2); 2026-12-10 is CET (UTC+1).
NOW = datetime(2026, 10, 16, 10, 0, tzinfo=UTC)  # 12:00 in Rome


class TestFormatResetIt:
    def test_same_day_in_rome_time(self):
        # 10:30 UTC = 12:30 CEST
        assert format_reset_it(datetime(2026, 10, 16, 10, 30, tzinfo=UTC), now=NOW) == "oggi dopo le 12:30"

    def test_next_day_is_domani(self):
        # 07:10 UTC next day = 09:10 CEST
        assert format_reset_it(datetime(2026, 10, 17, 7, 10, tzinfo=UTC), now=NOW) == "domani dopo le 09:10"

    def test_later_date_is_spelled_out(self):
        assert format_reset_it(datetime(2026, 10, 23, 7, 10, tzinfo=UTC), now=NOW) == "il 23/10 dopo le 09:10"

    def test_day_is_judged_in_rome_not_in_utc(self):
        # 22:30 UTC on the 16th is 00:30 on the 17th in Rome: "domani", not "oggi".
        assert format_reset_it(datetime(2026, 10, 16, 22, 30, tzinfo=UTC), now=NOW) == "domani dopo le 00:30"

    def test_winter_time_uses_cet(self):
        winter_now = datetime(2026, 12, 10, 10, 0, tzinfo=UTC)
        assert format_reset_it(datetime(2026, 12, 10, 10, 30, tzinfo=UTC), now=winter_now) == "oggi dopo le 11:30"

    def test_naive_datetime_is_read_as_utc(self):
        assert format_reset_it(datetime(2026, 10, 16, 10, 30), now=NOW) == "oggi dopo le 12:30"


class TestQuotaExceededError:
    def test_is_a_429_with_reset_and_period_in_detail(self):
        reset = NOW + timedelta(hours=3)
        exc = QuotaExceededError("upload_video", reset, now=NOW)

        assert isinstance(exc, QuotaExceeded)
        assert exc.status_code == 429
        assert exc.error_code == "QUOTA_EXCEEDED"
        assert exc.detail == {"tool_name": "upload_video", "reset_at": reset.isoformat(), "period": "daily"}

    def test_message_names_the_resource_and_when_to_retry(self):
        exc = QuotaExceededError("upload_video", datetime(2026, 10, 17, 7, 10, tzinfo=UTC), now=NOW)
        assert exc.message == "Hai raggiunto il limite giornaliero di caricamenti video. Riprova domani dopo le 09:10."

    def test_photo_and_weekly_wording(self):
        exc = QuotaExceededError("upload_image", datetime(2026, 10, 23, 7, 10, tzinfo=UTC), period="weekly", now=NOW)
        assert exc.message == "Hai raggiunto il limite settimanale di caricamenti foto. Riprova il 23/10 dopo le 09:10."

    def test_unknown_tool_falls_back_to_its_name(self):
        exc = QuotaExceededError("brand_new_tool", NOW + timedelta(hours=1), now=NOW)
        assert "brand_new_tool" in exc.message


class TestQuotaUnavailableError:
    def test_is_a_503_that_carries_the_retry_time(self):
        retry_at = NOW + timedelta(minutes=5)
        exc = QuotaUnavailableError("upload_image", retry_at)

        assert isinstance(exc, ServiceError)
        assert exc.status_code == 503
        assert exc.error_code == "QUOTA_UNAVAILABLE"
        assert exc.detail == {"tool_name": "upload_image", "reset_at": retry_at.isoformat()}
        assert "limite" not in exc.message  # it is not a "limit reached"


def _decision(*, allowed: bool, reason: QuotaReason, period: str | None = None) -> QuotaDecision:
    return QuotaDecision(
        allowed=allowed,
        remaining=0 if not allowed else 1,
        reset_at=NOW + timedelta(hours=2),
        reason=reason,
        period=period,
    )


class TestEnforceQuota:
    async def test_returns_the_decision_when_allowed(self):
        decision = _decision(allowed=True, reason=QuotaReason.OK)
        with patch.object(quota, "check_quota", new=AsyncMock(return_value=decision)):
            assert await enforce_quota("uid", "upload_video") is decision

    async def test_raises_429_when_the_limit_is_reached(self):
        decision = _decision(allowed=False, reason=QuotaReason.LIMIT_REACHED, period="weekly")
        with patch.object(quota, "check_quota", new=AsyncMock(return_value=decision)), \
             pytest.raises(QuotaExceededError) as caught:
            await enforce_quota("uid", "upload_video")

        assert caught.value.detail["period"] == "weekly"
        assert caught.value.detail["reset_at"] == decision.reset_at.isoformat()

    async def test_raises_503_when_the_quota_service_is_down(self):
        decision = _decision(allowed=False, reason=QuotaReason.UNAVAILABLE)
        with patch.object(quota, "check_quota", new=AsyncMock(return_value=decision)), \
             pytest.raises(QuotaUnavailableError):
            await enforce_quota("uid", "upload_video")

    async def test_forwards_the_project_scope(self):
        check = AsyncMock(return_value=_decision(allowed=True, reason=QuotaReason.OK))
        with patch.object(quota, "check_quota", new=check):
            await enforce_quota("uid", "generate_render", project_id="p1")
        check.assert_awaited_once_with("uid", "generate_render", "p1")


class TestCheckQuotaReasons:
    """The reason is what lets callers tell "limit reached" from "Firestore down"."""

    @pytest.fixture(autouse=True)
    def _production(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(quota.settings, "ENV", "production")

    def _db_returning(self, snapshot: MagicMock) -> MagicMock:
        db = MagicMock()
        db.collection.return_value.document.return_value.get = AsyncMock(return_value=snapshot)
        return db

    async def test_daily_limit_reached(self):
        snap = MagicMock(exists=True)
        snap.to_dict.return_value = {"count": 2, "window_start": utc_now() - timedelta(hours=1)}

        with patch.object(quota, "get_async_firestore_client", return_value=self._db_returning(snap)):
            decision = await check_quota("authenticatedUser123", "generate_render")

        assert (decision.allowed, decision.reason, decision.period) == (False, QuotaReason.LIMIT_REACHED, "daily")

    async def test_ok_decision_has_no_period(self):
        snap = MagicMock(exists=False)

        with patch.object(quota, "get_async_firestore_client", return_value=self._db_returning(snap)):
            decision = await check_quota("authenticatedUser123", "generate_render")

        assert (decision.allowed, decision.reason, decision.period) == (True, QuotaReason.OK, None)

    async def test_client_initialisation_failure_is_unavailable_too(self):
        # Credentials / network problems surface when the client is created.
        with patch.object(quota, "get_async_firestore_client", side_effect=ValueError("bad credentials")):
            decision = await check_quota("authenticatedUser123", "upload_video")

        assert (decision.allowed, decision.reason) == (False, QuotaReason.UNAVAILABLE)

    async def test_firestore_failure_is_unavailable_not_limit_reached(self):
        db = MagicMock()
        db.collection.return_value.document.return_value.get = AsyncMock(side_effect=RuntimeError("firestore down"))

        before = utc_now()
        with patch.object(quota, "get_async_firestore_client", return_value=db):
            decision = await check_quota("authenticatedUser123", "upload_video")

        assert decision.allowed is False
        assert decision.reason is QuotaReason.UNAVAILABLE
        assert decision.period is None
        assert before + timedelta(minutes=4) < decision.reset_at < before + timedelta(minutes=6)


class TestFeatureNotAvailable:
    """A tier limit of 0 means "not for this account" — not "come back tomorrow"."""

    @pytest.fixture(autouse=True)
    def _production(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(quota.settings, "ENV", "production")

    @pytest.mark.parametrize("has_window", [False, True])
    async def test_zero_limit_is_not_available_with_or_without_a_window(self, has_window):
        snap = MagicMock(exists=has_window)
        snap.to_dict.return_value = {"count": 0, "window_start": utc_now() - timedelta(hours=1)}
        db = MagicMock()
        db.collection.return_value.document.return_value.get = AsyncMock(return_value=snap)

        with patch.object(quota, "get_async_firestore_client", return_value=db):
            # "guest_abc" is not a Firebase UID: anonymous tier, upload_video limit 0
            decision = await check_quota("guest_abc", "upload_video")

        assert (decision.allowed, decision.reason, decision.period) == (False, QuotaReason.NOT_AVAILABLE, None)

    def test_denial_is_a_403_with_its_own_code_and_no_promise_to_retry(self):
        decision = QuotaDecision(False, 0, NOW + timedelta(hours=24), QuotaReason.NOT_AVAILABLE)

        error = quota_denial("upload_video", decision)

        assert isinstance(error, QuotaNotAvailableError)
        assert isinstance(error, PermissionDenied)
        assert (error.status_code, error.error_code) == (403, "FEATURE_NOT_AVAILABLE")
        assert "Riprova" not in error.message
        assert error.detail == {"tool_name": "upload_video"}  # no reset_at → no Retry-After
