"""Safari on iPhone never produced an App Check token (reCAPTCHA failing on the
device): for 14 days every client-area call from iPhone was answered 403
"Missing App Check token". A signed-in, non-anonymous user may read their own
dashboard and claim its guest chats without App Check; a guest may only get
its claim ticket; chat, renders, uploads and writes stay strict."""
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import Request
from src.core.exceptions import AppCheckError
from src.middleware import app_check

REGISTERED = {"uid": "u1", "aud": "proj", "firebase": {"sign_in_provider": "apple.com"}}
ANONYMOUS = {"uid": "a1", "aud": "proj", "firebase": {"sign_in_provider": "anonymous"}}


@pytest.fixture(autouse=True)
def _strict(monkeypatch):
    monkeypatch.setattr(app_check, "ENABLE_APP_CHECK", True)
    monkeypatch.setattr(app_check.settings, "GOOGLE_CLOUD_PROJECT", "proj")
    # No Firebase credentials in CI: the SDK init is not what these tests exercise.
    monkeypatch.setattr(app_check, "init_firebase", lambda: None)


def _request(method: str, path: str, bearer: str | None = "tok") -> Request:
    headers = [(b"authorization", f"Bearer {bearer}".encode())] if bearer else []
    return Request({"type": "http", "method": method, "path": path, "headers": headers})


def _verified(decoded):
    return patch.object(app_check, "_verify_id_token_cached", AsyncMock(return_value=decoded))


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/projects"),
        ("GET", "/api/projects/0a1b2c3d-1111-2222-3333-444455556666"),
        ("GET", "/api/reports/dashboard"),
        ("GET", "/api/reports/gallery"),
        ("GET", "/api/quote/user/u1"),
        ("POST", "/api/guest-claim"),
        ("GET", "/api/me/chat"),
    ],
)
async def test_registered_user_reads_dashboard_without_app_check(method, path):
    with _verified(REGISTERED):
        assert await app_check.validate_app_check_token(_request(method, path)) is None


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/chat/stream"),
        ("POST", "/api/upload/image"),
        ("POST", "/api/projects"),
        ("DELETE", "/api/projects/abc"),
        ("POST", "/feedback"),
        ("GET", "/api/admin/quotes"),
        ("GET", "/api/projects/abc/files/x"),
    ],
)
async def test_other_routes_stay_strict(method, path):
    with _verified(REGISTERED), pytest.raises(AppCheckError):
        await app_check.validate_app_check_token(_request(method, path))


@pytest.mark.parametrize(
    ("method", "path"), [("GET", "/api/projects"), ("POST", "/api/guest-claim"), ("GET", "/api/me/chat")]
)
async def test_anonymous_user_gets_no_fallback(method, path):
    with _verified(ANONYMOUS), pytest.raises(AppCheckError):
        await app_check.validate_app_check_token(_request(method, path))


async def test_a_guest_gets_its_claim_ticket_without_app_check():
    """Without the ticket the guest's login cannot start on those devices."""
    with _verified(ANONYMOUS):
        assert await app_check.validate_app_check_token(_request("POST", "/api/guest-claim/ticket")) is None


async def test_the_claim_ticket_still_needs_a_verified_token():
    failing = AsyncMock(side_effect=ValueError("bad token"))
    with patch.object(app_check, "_verify_id_token_cached", failing), pytest.raises(AppCheckError):
        await app_check.validate_app_check_token(_request("POST", "/api/guest-claim/ticket"))


async def test_no_bearer_gets_no_fallback():
    with pytest.raises(AppCheckError):
        await app_check.validate_app_check_token(_request("GET", "/api/projects", bearer=None))


async def test_invalid_id_token_gets_no_fallback():
    failing = AsyncMock(side_effect=ValueError("bad token"))
    with patch.object(app_check, "_verify_id_token_cached", failing), pytest.raises(AppCheckError):
        await app_check.validate_app_check_token(_request("GET", "/api/projects"))


async def test_wrong_audience_gets_no_fallback():
    with _verified({**REGISTERED, "aud": "other"}), pytest.raises(AppCheckError):
        await app_check.validate_app_check_token(_request("GET", "/api/projects"))


async def test_invalid_app_check_token_is_not_rescued():
    """The fallback covers a MISSING token only: a forged or expired one is still rejected."""
    req = Request({
        "type": "http", "method": "GET", "path": "/api/projects",
        "headers": [(b"authorization", b"Bearer tok"), (b"x-firebase-appcheck", b"forged")],
    })
    with _verified(REGISTERED), patch.object(app_check.app_check, "verify_token", side_effect=ValueError), \
            patch.object(app_check, "init_firebase"), pytest.raises(AppCheckError):
        await app_check.validate_app_check_token(req)
