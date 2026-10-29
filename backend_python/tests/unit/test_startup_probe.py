"""
/health/startup — Cloud Run startup probe.

Returns 503 while the background warm-up runs and 200 once it is done, so
Cloud Run never routes a chat turn to a half-initialized instance.
"""
import asyncio
from types import SimpleNamespace

import main
import pytest
from main import startup_check
from src.core.config import settings
from starlette.datastructures import State


def _request(warmup_task):
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(warmup_task=warmup_task)))


def _finished(*, error: BaseException | None = None):
    return SimpleNamespace(done=lambda: True, cancelled=lambda: False, exception=lambda: error)


def test_warming_up_returns_503():
    response = startup_check(_request(SimpleNamespace(done=lambda: False)))
    assert response.status_code == 503


def test_missing_warmup_task_returns_503():
    response = startup_check(SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace())))
    assert response.status_code == 503


def test_warmup_done_returns_200():
    assert startup_check(_request(_finished())) == {"status": "started"}


def test_strict_mode_holds_startup_when_a_model_is_unavailable(monkeypatch):
    from src.core.config import settings

    monkeypatch.setattr(settings, "MODEL_VALIDATION_STRICT", True)
    request = _request(_finished())
    request.app.state.model_problems = ["model 'retired' is not available: 404"]
    response = startup_check(request)
    assert response.status_code == 503


def test_non_strict_mode_only_logs_unavailable_models(monkeypatch):
    from src.core.config import settings

    monkeypatch.setattr(settings, "MODEL_VALIDATION_STRICT", False)
    request = _request(_finished())
    request.app.state.model_problems = ["model 'retired' is not available: 404"]
    assert startup_check(request) == {"status": "started"}


def test_startup_probe_is_reachable_without_app_check_token(monkeypatch):
    """Cloud Run's startup probe sends no App Check header: a 403 would keep
    every new revision from starting."""
    import src.middleware.app_check as app_check
    from fastapi.testclient import TestClient
    from main import app

    # The middleware reads the flag at import time: patch the module constant.
    monkeypatch.setattr(app_check, "ENABLE_APP_CHECK", True)
    # No `with`: the lifespan (real warm-up, network) does not run, so the
    # probe answers 503 "warming_up" — anything but App Check's 403.
    response = TestClient(app).get("/health/startup")
    assert response.status_code == 503
    assert response.json() == {"status": "warming_up"}


def test_strict_mode_does_not_expose_model_details(monkeypatch):
    from src.core.config import settings

    monkeypatch.setattr(settings, "MODEL_VALIDATION_STRICT", True)
    request = _request(_finished())
    request.app.state.model_problems = ["model 'x' is not available: 404 secret detail"]
    response = startup_check(request)
    assert b"secret detail" not in response.body


def test_unexpected_warmup_error_holds_startup_without_details():
    """A bug in startup code keeps the revision out of service (the previous
    one keeps serving) instead of passing the probe half-initialized."""
    response = startup_check(_request(_finished(error=TypeError("secret detail"))))
    assert response.status_code == 503
    assert response.body == b'{"status":"warmup_failed"}'


# ── The real warm-up of main.py, with every step replaced ────────────────────


@pytest.fixture
def warmup_steps(monkeypatch):
    """No network: each warm-up step is a no-op unless a test overrides it."""

    async def noop_async() -> None:
        return None

    monkeypatch.setattr(settings, "WARMUP_STEP_TIMEOUT_SECONDS", 0.2)
    monkeypatch.setattr(main, "validate_configured_models", _no_problems)
    monkeypatch.setattr(main, "warm_up_orchestrator", lambda: None)
    monkeypatch.setattr(main, "init_firebase", lambda: None)
    monkeypatch.setattr(main, "get_model_armor_service", lambda: None)
    monkeypatch.setattr(main, "get_async_firestore_client", lambda: None)
    monkeypatch.setattr(main.PricingService, "ensure_fresh", noop_async)
    return monkeypatch


async def _no_problems() -> list[str]:
    return []


async def _hang() -> list[str]:
    await asyncio.Event().wait()
    return []


async def test_hung_model_validation_does_not_block_startup(warmup_steps):
    warmup_steps.setattr(settings, "MODEL_VALIDATION_STRICT", False)
    warmup_steps.setattr(main, "validate_configured_models", _hang)
    state = State()

    task = asyncio.create_task(main.background_warmup(state))
    await asyncio.wait_for(task, timeout=5)
    state.warmup_task = task

    assert state.warmup_report["models"] == "timed_out"
    assert state.warmup_report["price_book"] == "done"
    assert startup_check(SimpleNamespace(app=SimpleNamespace(state=state))) == {"status": "started"}


async def test_strict_mode_holds_startup_when_model_validation_times_out(warmup_steps):
    warmup_steps.setattr(settings, "MODEL_VALIDATION_STRICT", True)
    warmup_steps.setattr(main, "validate_configured_models", _hang)
    state = State()

    task = asyncio.create_task(main.background_warmup(state))
    await asyncio.wait_for(task, timeout=5)
    state.warmup_task = task

    response = startup_check(SimpleNamespace(app=SimpleNamespace(state=state)))
    assert response.status_code == 503
    assert response.body == b'{"status":"model_unavailable"}'


async def test_completed_warmup_reports_every_step(warmup_steps):
    state = State()

    await main.background_warmup(state)

    assert state.warmup_report == dict.fromkeys(
        ("models", "adk_orchestrator", "firebase_admin", "model_armor", "firestore_async", "price_book"), "done"
    )
    assert state.model_problems == []
