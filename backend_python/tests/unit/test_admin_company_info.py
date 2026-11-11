"""Admin company info API (Phase 141): /api/admin/company-info, its history and the cache it feeds."""
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from src.api.routes import admin_company_info as routes
from src.auth.jwt_handler import verify_token
from src.core.exceptions import AppException
from src.schemas.internal import UserSession
from src.services import company_info
from src.services import company_info_service as service_module
from src.services.company_info_service import CompanyInfoService
from tests.unit.firestore_fakes import FakeDb, FakeTransaction

PATH = ("app_config", "company_info")
URL = "/api/admin/company-info"


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()

    async def transact(_db, body):
        return await body(FakeTransaction(fake))

    monkeypatch.setattr(company_info, "_transact", transact)
    monkeypatch.setattr(routes, "get_async_firestore_client", lambda: fake)
    monkeypatch.setattr(service_module, "get_async_firestore_client", lambda: fake)
    monkeypatch.setattr(routes, "emit_audit_event", lambda *a, **k: None)
    CompanyInfoService.reset_cache()
    yield fake
    CompanyInfoService.reset_cache()


def _client(role: str | None = "admin") -> TestClient:
    app = FastAPI()
    app.include_router(routes.router)

    @app.exception_handler(AppException)
    async def _handler(_request: Request, exc: AppException):
        return JSONResponse(status_code=exc.status_code, content={"error_code": exc.error_code, "detail": exc.detail})

    async def _session():
        return UserSession(
            uid="admin-a", email="a@syd.it", is_authenticated=True, claims={"role": role} if role else {}
        )

    app.dependency_overrides[verify_token] = _session
    return TestClient(app)


def _info(**changes) -> dict:
    info = company_info.seed_info().model_dump(mode="json")
    info.update(changes)
    return info


def _put(client, info, version="v0", **extra):
    return client.put(URL, json={"info": info, **extra}, headers={"If-Match": f'"{version}"'})


@pytest.mark.parametrize(("method", "path"), [("get", URL), ("put", URL), ("get", f"{URL}/history")])
def test_non_admin_is_refused(db, method, path):
    resp = getattr(_client(role=None), method)(path, **({"json": {}} if method == "put" else {}))
    assert resp.status_code == 403 and resp.json()["error_code"] == "ADMIN_REQUIRED"


def test_get_returns_the_seed_with_version_zero(db):
    resp = _client().get(URL)
    body = resp.json()
    assert resp.status_code == 200 and resp.headers["ETag"] == '"v0"'
    assert (body["source"], body["version"], body["etag"], body["ignored_document"]) == ("seed", 0, '"v0"', None)
    assert body["info"]["identity"]["legal_name"] == "SYD Bioedilizia S.r.l."


def test_get_tells_when_a_foreign_document_was_ignored(db):
    db.put(*PATH, {"info": {}})
    body = _client().get(URL).json()
    assert (body["source"], body["version"], body["ignored_document"]) == ("seed", 0, "legacy_document")


def test_put_requires_if_match(db):
    resp = _client().put(URL, json={"info": _info()})
    assert resp.status_code == 428 and resp.json()["error_code"] == "PRECONDITION_REQUIRED"


def test_a_save_is_visible_to_the_next_read_and_to_the_snapshot(db):
    client = _client()
    hours = [{"days": "Lun-Ven", "opens": "09:00", "closes": "18:00"}]
    resp = _put(client, _info(hours=hours), reason="Orari")
    assert resp.status_code == 200
    assert resp.json() == {"etag": '"v1"', "version": 1, "changed_parts": ["hours"]}
    assert resp.headers["ETag"] == '"v1"'

    again = client.get(URL).json()
    assert (again["source"], again["version"], again["updated_by"]) == ("firestore", 1, "admin-a")
    assert again["info"]["hours"] == hours
    # the instance that saved serves the new hours at once (others within the TTL)
    assert CompanyInfoService.snapshot().hours[0].opens == "09:00"
    assert CompanyInfoService.version() == 1


def test_a_save_over_a_newer_version_is_a_409(db):
    client = _client()
    _put(client, _info())
    resp = _put(client, _info(hours_note="Chiuso ad agosto"))
    assert resp.status_code == 409 and resp.json()["error_code"] == "VERSION_CONFLICT"
    assert CompanyInfoService.snapshot().hours_note == ""


def test_removing_a_builtin_section_is_422_and_nothing_is_saved(db):
    info = _info()
    info["sections"] = [s for s in info["sections"] if s["slug"] != "garanzie"]
    resp = _put(_client(), info)
    assert resp.status_code == 422
    assert db.get_data(*PATH) is None


def test_an_unknown_field_in_the_body_is_422(db):
    resp = _put(_client(), _info(), extra_field=1)
    assert resp.status_code == 422
    assert db.get_data(*PATH) is None


def test_history_lists_versions_newest_first_without_the_info(db):
    client = _client()
    _put(client, _info(), reason="Primo")
    _put(client, _info(hours_note="Chiuso ad agosto"), version="v1", reason="Secondo")
    history = client.get(f"{URL}/history").json()["items"]
    assert [h["version"] for h in history] == [2, 1]
    assert history[0]["reason"] == "Secondo" and history[0]["actor_uid"] == "admin-a"
    assert history[0]["changed_parts"] == ["hours_note"]
    assert "info" not in history[0]
