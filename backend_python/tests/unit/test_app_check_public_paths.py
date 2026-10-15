"""App Check exemptions: only machine endpoints with their own authentication
skip the App Check token (Phase 128: Cloud Tasks dispatch uses an id segment)."""
import main
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


def _client() -> TestClient:
    inner = FastAPI()

    @inner.post("/{path:path}")
    async def echo(path: str) -> dict[str, str]:
        return {"reached": path}

    return TestClient(main.AppCheckMiddleware(inner))


@pytest.mark.parametrize(
    "path",
    ["/internal/email/dispatch/abcdef123456", "/internal/email/sweep", "/webhooks/email/brevo"],
)
def test_machine_endpoints_skip_app_check(path):
    resp = _client().post(path)
    assert resp.status_code == 200 and resp.json()["reached"] == path.lstrip("/")


@pytest.mark.parametrize(
    "path",
    [
        "/internal/email/dispatchX/abc",
        "/internal/email/",
        "/api/admin/quotes",
        "/internal/emailx/dispatch/abc",
        "/webhooks/n8n",  # decommissioned: no longer exempt from App Check
    ],
)
def test_everything_else_still_needs_app_check(path, monkeypatch):
    async def reject(_request):
        raise main.AppCheckError("App Check token required.")

    monkeypatch.setattr(main, "validate_app_check_token", reject)
    assert _client().post(path).status_code == 403
