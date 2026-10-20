"""The inactivity warning reports whether the email actually left: the lifecycle
must not start the countdown to disable/erase an account on a notice that was
never delivered."""
from unittest.mock import AsyncMock, patch

from src.services import notification_service
from src.services.email.types import ProviderError
from src.services.notification_service import NotificationService


async def test_a_delivered_warning_returns_true():
    with patch.object(NotificationService, "_send_email", new=AsyncMock()):
        assert await NotificationService().send_inactivity_warning("a@b.it", "Mario", 30) is True


async def test_an_undelivered_warning_returns_false_and_is_flagged():
    flag = AsyncMock(return_value="flagged")
    with patch.object(NotificationService, "_send_email", new=AsyncMock(side_effect=ProviderError("down"))), \
         patch.object(NotificationService, "_firestore_flag_notification", new=flag):
        assert await NotificationService().send_inactivity_warning("a@b.it", "Mario", 30) is False
    flag.assert_awaited_once()


def test_module_is_importable():
    assert notification_service.NotificationService is NotificationService
