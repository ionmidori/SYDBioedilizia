"""n8n is decommissioned: no inbound callback, no App Check exemption, and a
stale N8N_* environment cannot break startup.

The Cloud Run service may keep its N8N_* env vars until they are removed by
hand (runbook step after deploy). Settings ignores unknown keys
(extra="ignore"); if that ever became "forbid", deploying this code before the
env cleanup would stop the backend from starting — this test catches it.
"""
from __future__ import annotations

import main
from main import app
from src.core.config import Settings


def test_inbound_n8n_webhook_route_removed() -> None:
    assert "/webhooks/n8n" not in app.openapi()["paths"]


def test_n8n_path_no_longer_bypasses_app_check() -> None:
    assert "/webhooks/n8n" not in main.AppCheckMiddleware._PUBLIC_PATHS


def test_stale_n8n_env_vars_do_not_break_settings(monkeypatch) -> None:
    for name in (
        "N8N_WEBHOOK_NOTIFY_ADMIN",
        "N8N_WEBHOOK_DELIVER_QUOTE",
        "N8N_API_KEY",
        "N8N_WEBHOOK_HMAC_SECRET",
        "N8N_ALLOWED_WEBHOOK_HOSTS",
    ):
        monkeypatch.setenv(name, "stale-value-from-cloud-run")

    settings = Settings()

    assert not hasattr(settings, "N8N_API_KEY")
