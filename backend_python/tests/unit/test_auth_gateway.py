"""Firebase Auth operations of the erasure and the lifecycle: idempotent, never guessing."""
from unittest.mock import MagicMock, patch

import pytest
from firebase_admin import auth
from src.services import auth_gateway
from src.services.auth_gateway import AuthContact, FirebaseAuthGateway


@pytest.fixture(autouse=True)
def _no_firebase_init():
    with patch.object(auth_gateway, "init_firebase"):
        yield


def _missing(*_args, **_kwargs):
    raise auth.UserNotFoundError("gone")


async def test_disable_and_revoke():
    with patch.object(auth_gateway.auth, "update_user") as update, \
         patch.object(auth_gateway.auth, "revoke_refresh_tokens") as revoke:
        assert await FirebaseAuthGateway().disable_and_revoke("u1") is True

    update.assert_called_once_with("u1", disabled=True)
    revoke.assert_called_once_with("u1")


async def test_disable_of_a_missing_account_is_a_no_op():
    with patch.object(auth_gateway.auth, "update_user", side_effect=_missing):
        assert await FirebaseAuthGateway().disable_and_revoke("u1") is False


async def test_delete_user():
    with patch.object(auth_gateway.auth, "delete_user") as delete:
        assert await FirebaseAuthGateway().delete_user("u1") is True
    delete.assert_called_once_with("u1")


async def test_deleting_a_missing_account_is_a_no_op():
    with patch.object(auth_gateway.auth, "delete_user", side_effect=_missing):
        assert await FirebaseAuthGateway().delete_user("u1") is False


async def test_contact_comes_from_firebase_auth():
    user = MagicMock(email="mario@example.it", display_name="Mario")
    with patch.object(auth_gateway.auth, "get_user", return_value=user):
        assert await FirebaseAuthGateway().get_contact("u1") == AuthContact(email="mario@example.it", display_name="Mario")


async def test_contact_of_a_missing_account_is_none():
    with patch.object(auth_gateway.auth, "get_user", side_effect=_missing):
        assert await FirebaseAuthGateway().get_contact("u1") is None


async def test_other_errors_propagate():
    with patch.object(auth_gateway.auth, "delete_user", side_effect=RuntimeError("network")), \
         pytest.raises(RuntimeError):
        await FirebaseAuthGateway().delete_user("u1")
