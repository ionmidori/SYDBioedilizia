"""
/health/startup — Cloud Run startup probe.

Returns 503 while the background warm-up runs and 200 once it is done, so
Cloud Run never routes a chat turn to a half-initialized instance.
"""
from types import SimpleNamespace

from main import startup_check


def _request(warmup_task):
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(warmup_task=warmup_task)))


def test_warming_up_returns_503():
    response = startup_check(_request(SimpleNamespace(done=lambda: False)))
    assert response.status_code == 503


def test_missing_warmup_task_returns_503():
    response = startup_check(SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace())))
    assert response.status_code == 503


def test_warmup_done_returns_200():
    assert startup_check(_request(SimpleNamespace(done=lambda: True))) == {"status": "started"}


def test_strict_mode_holds_startup_when_a_model_is_unavailable(monkeypatch):
    from src.core.config import settings

    monkeypatch.setattr(settings, "MODEL_VALIDATION_STRICT", True)
    request = _request(SimpleNamespace(done=lambda: True))
    request.app.state.model_problems = ["model 'retired' is not available: 404"]
    response = startup_check(request)
    assert response.status_code == 503


def test_non_strict_mode_only_logs_unavailable_models(monkeypatch):
    from src.core.config import settings

    monkeypatch.setattr(settings, "MODEL_VALIDATION_STRICT", False)
    request = _request(SimpleNamespace(done=lambda: True))
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
    request = _request(SimpleNamespace(done=lambda: True))
    request.app.state.model_problems = ["model 'x' is not available: 404 secret detail"]
    response = startup_check(request)
    assert b"secret detail" not in response.body
