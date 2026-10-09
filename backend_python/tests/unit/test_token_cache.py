"""
Verified-token cache in src/auth/jwt_handler.py.

The revocation check is a network call to Firebase Auth on every request; a
token that verified clean is reused for a short window (capped at its expiry).
"""
import time
from unittest.mock import patch

import pytest
from firebase_admin import auth
from src.auth.jwt_handler import _verify_id_token_cached


def _claims(exp_in: float = 3600) -> dict:
    return {"uid": "u1", "aud": "proj", "exp": time.time() + exp_in}


async def test_verified_token_is_reused_within_the_window():
    with patch("src.auth.jwt_handler.auth.verify_id_token", return_value=_claims()) as verify:
        first = await _verify_id_token_cached("tok", 300)
        second = await _verify_id_token_cached("tok", 300)
    assert first == second
    verify.assert_called_once_with("tok", check_revoked=True, clock_skew_seconds=60)


async def test_cache_disabled_verifies_every_time():
    with patch("src.auth.jwt_handler.auth.verify_id_token", return_value=_claims()) as verify:
        await _verify_id_token_cached("tok", 0)
        await _verify_id_token_cached("tok", 0)
    assert verify.call_count == 2


async def test_cache_never_outlives_the_token():
    with patch("src.auth.jwt_handler.auth.verify_id_token", return_value=_claims(exp_in=-1)) as verify:
        await _verify_id_token_cached("tok", 300)
        await _verify_id_token_cached("tok", 300)
    assert verify.call_count == 2


async def test_failed_verification_is_not_cached():
    with patch(
        "src.auth.jwt_handler.auth.verify_id_token",
        side_effect=auth.RevokedIdTokenError("revoked"),
    ) as verify:
        for _ in range(2):
            with pytest.raises(auth.RevokedIdTokenError):
                await _verify_id_token_cached("tok", 300)
    assert verify.call_count == 2


async def test_different_tokens_are_verified_separately():
    with patch("src.auth.jwt_handler.auth.verify_id_token", return_value=_claims()) as verify:
        await _verify_id_token_cached("tok-a", 300)
        await _verify_id_token_cached("tok-b", 300)
    assert verify.call_count == 2
