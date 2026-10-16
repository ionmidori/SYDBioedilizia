"""account_kind: tri-state Firebase account lookup that never guesses."""
from unittest.mock import MagicMock, patch

import pytest
from firebase_admin import auth
from src.auth import user_lookup
from src.auth.user_lookup import AccountKind, account_kind


@pytest.mark.parametrize(
    ("provider_data", "expected"),
    [([MagicMock(provider_id="password")], AccountKind.REGISTERED), ([], AccountKind.ANONYMOUS)],
)
async def test_account_kind_reads_linked_providers(provider_data, expected):
    user = MagicMock(provider_data=provider_data)
    with patch.object(user_lookup, "init_firebase"), \
         patch.object(user_lookup.auth, "get_user", return_value=user):
        assert await account_kind("uid-1") is expected


async def test_deleted_account_is_missing():
    with patch.object(user_lookup, "init_firebase"), \
         patch.object(user_lookup.auth, "get_user", side_effect=auth.UserNotFoundError("gone")):
        assert await account_kind("uid-1") is AccountKind.MISSING


async def test_lookup_errors_propagate_instead_of_guessing():
    with patch.object(user_lookup, "init_firebase"), \
         patch.object(user_lookup.auth, "get_user", side_effect=RuntimeError("network")), \
         pytest.raises(RuntimeError):
        await account_kind("uid-1")


async def test_broken_firebase_setup_is_not_mistaken_for_a_missing_account():
    # init_firebase raising ValueError (bad credentials) must surface, otherwise
    # every registered owner would be reported as "account gone".
    with patch.object(user_lookup, "init_firebase", side_effect=ValueError("bad credentials")), \
         pytest.raises(ValueError):
        await account_kind("uid-1")


async def test_empty_uid_is_missing_without_a_lookup():
    with patch.object(user_lookup.auth, "get_user") as get_user:
        assert await account_kind("") is AccountKind.MISSING
    get_user.assert_not_called()
