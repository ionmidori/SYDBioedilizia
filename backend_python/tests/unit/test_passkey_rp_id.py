"""Unit tests for `_resolve_rp_id` — the RP_ID whitelist resolver of the passkey API.

Covers the Origin-header parsing path, which used to swallow *every* exception
silently (`except: pass`). A malformed Origin must degrade to the Host /
X-Forwarded-Host candidates rather than blowing up or vanishing without a trace.
"""
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from src.api.routes.passkey import _resolve_rp_id
from src.core.config import settings
from starlette.requests import Request


def _request(**headers: str) -> Request:
    """Build a bare Starlette Request carrying only the given headers."""
    raw = [(k.replace("_", "-").encode(), v.encode()) for k, v in headers.items()]
    return Request({"type": "http", "method": "POST", "path": "/", "headers": raw})


def test_explicit_setting_wins():
    with patch.object(settings, "RP_ID", "sydbioedilizia.vercel.app"):
        assert _resolve_rp_id(_request(origin="https://evil.example")) == "sydbioedilizia.vercel.app"


def test_whitelisted_origin():
    with patch.object(settings, "RP_ID", ""):
        assert _resolve_rp_id(_request(origin="https://sydbioedilizia.vercel.app")) == "sydbioedilizia.vercel.app"


def test_origin_is_case_normalised():
    with patch.object(settings, "RP_ID", ""):
        assert _resolve_rp_id(_request(origin="https://SydBioedilizia.Vercel.App")) == "sydbioedilizia.vercel.app"


def test_malformed_origin_falls_back_to_host():
    """`urlparse` raises ValueError on an unterminated IPv6 literal.

    The old bare `except: pass` hid this; the resolver must still reach the
    Host header instead of propagating or silently rejecting.
    """
    with patch.object(settings, "RP_ID", ""):
        req = _request(origin="http://[::1", host="localhost:3000")
        assert _resolve_rp_id(req) == "localhost"


def test_malformed_origin_is_logged(caplog):
    with patch.object(settings, "RP_ID", ""), caplog.at_level("WARNING"):
        _resolve_rp_id(_request(origin="http://[::1", host="localhost:3000"))
    assert any("Unparsable Origin" in r.message for r in caplog.records)


def test_team_scoped_preview_allowed():
    with patch.object(settings, "RP_ID", ""):
        origin = "https://sydbioedilizia-git-feat-x-ionmidori.vercel.app"
        assert _resolve_rp_id(_request(origin=origin)) == origin.removeprefix("https://")


def test_foreign_vercel_project_rejected():
    """A non-team-scoped *.vercel.app must not become the RP_ID (F-04)."""
    with patch.object(settings, "RP_ID", ""), patch.object(settings, "ENV", "production"):
        with pytest.raises(HTTPException) as exc:
            _resolve_rp_id(_request(origin="https://sydbioedilizia-evil-attacker.vercel.app"))
        assert exc.value.status_code == 400
