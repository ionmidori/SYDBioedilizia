"""n8n is decommissioned: no inbound callback, no App Check exemption, and a
stale N8N_* configuration cannot break startup.

Stale values can reach Settings two ways, and only one of them is sensitive to
``extra``: pydantic-settings drops OS environment variables that have no field
whatever ``extra`` says (Cloud Run env vars are OS variables), but unknown keys
in a dotenv file raise under ``extra="forbid"``. A developer's backend_python/.env
may still hold N8N_* lines, so that is the case worth pinning.

That the removed route also stays unreachable behind App Check is asserted in
test_app_check_public_paths.py (``/webhooks/n8n`` must get 403, not reach a handler).
"""
from __future__ import annotations

from pathlib import Path

import main
from main import app
from src.core.config import Settings

N8N_KEYS = (
    "N8N_WEBHOOK_NOTIFY_ADMIN",
    "N8N_WEBHOOK_DELIVER_QUOTE",
    "N8N_API_KEY",
    "N8N_WEBHOOK_HMAC_SECRET",
    "N8N_ALLOWED_WEBHOOK_HOSTS",
)


def test_inbound_n8n_webhook_route_removed() -> None:
    assert "/webhooks/n8n" not in app.openapi()["paths"]


def test_n8n_path_is_not_exempt_from_app_check() -> None:
    assert "/webhooks/n8n" not in main.AppCheckMiddleware._PUBLIC_PATHS
    assert not any("n8n" in prefix for prefix in main.AppCheckMiddleware._PUBLIC_PREFIXES)


def test_stale_n8n_lines_in_a_dotenv_file_do_not_break_settings(tmp_path: Path) -> None:
    dotenv = tmp_path / ".env"
    dotenv.write_text("".join(f"{key}=stale-value\n" for key in N8N_KEYS), encoding="utf-8")

    settings = Settings(_env_file=dotenv)

    assert not any(hasattr(settings, key) for key in N8N_KEYS)
    assert Settings.model_config["extra"] == "ignore"
