"""Price book on Firestore (Phase 128, Fase 6.1a): schema, versioned store,
the PricingService cache the AI reads, and the /api/admin/price-book routes."""
import time
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from google.api_core.exceptions import ServiceUnavailable
from pydantic import ValidationError
from src.api.routes import admin_price_book as routes
from src.auth.jwt_handler import verify_token
from src.core.exceptions import AppException, PriceBookConflictError
from src.schemas.internal import UserSession
from src.schemas.price_book import PriceBookItem, PutPriceBookBody
from src.services import price_book
from src.services import pricing_service as pricing_module
from src.services.pricing_service import PricingService
from tests.unit.firestore_fakes import FakeDb, FakeTransaction

NOW = datetime(2026, 10, 11, 10, 0, tzinfo=UTC)
PATH = ("app_config", "price_book")


def _item(**overrides):
    base = {"sku": "TST-001", "description": "Voce di prova", "unit": "mq", "unit_price": 10.0, "category": "Test"}
    base.update(overrides)
    return base


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()

    async def transact(_db, body):
        return await body(FakeTransaction(fake))

    monkeypatch.setattr(price_book, "_transact", transact)
    monkeypatch.setattr(routes, "get_async_firestore_client", lambda: fake)
    monkeypatch.setattr(pricing_module, "get_async_firestore_client", lambda: fake)
    monkeypatch.setattr(routes, "emit_audit_event", lambda *a, **k: None)
    return fake


# ── Schema ────────────────────────────────────────────────────────────────────


def test_the_bundled_price_book_satisfies_the_schema():
    """Parity: whatever the seed contains, the editor can load and save it back unchanged."""
    seed = price_book.seed_items()
    assert len(seed) >= 60
    parsed = [PriceBookItem(**item) for item in seed]
    assert [i.model_dump(exclude_none=True) for i in parsed] == seed


@pytest.mark.parametrize(
    "bad",
    [
        {"sku": "con spazio"},
        {"sku": ""},
        {"unit_price": -1},
        {"description": "   "},
        {"min_qty": 5, "max_qty": 1},
        {"range_min": 9, "range_max": 3},
        {"unknown_field": "x"},
    ],
)
def test_invalid_items_are_rejected(bad):
    with pytest.raises(ValidationError):
        PriceBookItem(**_item(**bad))


def test_duplicate_skus_are_rejected_even_when_only_the_case_differs():
    with pytest.raises(ValidationError, match="Duplicate SKU"):
        PutPriceBookBody(items=[_item(), _item(sku="tst-001")])


def test_an_empty_price_book_is_rejected():
    with pytest.raises(ValidationError):
        PutPriceBookBody(items=[])


# ── Store ─────────────────────────────────────────────────────────────────────


async def test_without_a_document_the_seed_is_served_as_version_zero(db):
    state = await price_book.read_state(db)
    assert (state.source, state.version) == ("seed", 0)
    assert state.items == price_book.seed_items()


async def test_a_save_creates_the_document_and_a_history_entry(db):
    items = [PriceBookItem(**_item()), PriceBookItem(**_item(sku="TST-002"))]
    result = await price_book.save(db, items, 0, "admin-a", NOW, reason="Aggiornamento listino")

    assert (result.version, result.item_count) == (1, 2)
    stored = db.get_data(*PATH)
    assert stored["version"] == 1 and stored["updated_by"] == "admin-a" and len(stored["items"]) == 2
    history = db.get_data(*PATH, "history", "1")
    assert history["actor_uid"] == "admin-a" and history["reason"] == "Aggiornamento listino"
    # first save compares against the seed: everything in the seed is removed, 2 added
    assert history["added"] == 2 and history["removed"] == len(price_book.seed_items())


async def test_optional_fields_that_are_unset_are_not_stored(db):
    await price_book.save(db, [PriceBookItem(**_item())], 0, "admin-a", NOW)
    assert db.get_data(*PATH)["items"][0].keys() >= {"sku", "unit_price"}
    assert "subcategory" not in db.get_data(*PATH)["items"][0]


async def test_a_stale_version_is_a_conflict_and_changes_nothing(db):
    await price_book.save(db, [PriceBookItem(**_item())], 0, "admin-a", NOW)
    with pytest.raises(PriceBookConflictError) as exc:
        await price_book.save(db, [PriceBookItem(**_item(unit_price=99))], 0, "admin-b", NOW)
    assert exc.value.detail == {"expected_version": 0, "current_version": 1}
    assert db.get_data(*PATH)["items"][0]["unit_price"] == 10.0
    assert db.get_data(*PATH, "history", "2") is None


async def test_second_save_counts_what_changed(db):
    await price_book.save(db, [PriceBookItem(**_item()), PriceBookItem(**_item(sku="TST-002"))], 0, "a", NOW)
    result = await price_book.save(
        db,
        [PriceBookItem(**_item(unit_price=12.5)), PriceBookItem(**_item(sku="TST-003"))],
        1,
        "a",
        NOW,
    )
    assert (result.version, result.added, result.removed, result.changed) == (2, 1, 1, 1)


# ── The cache the AI reads ────────────────────────────────────────────────────


@pytest.fixture
def live(db):
    """A price book in Firestore and a PricingService that is allowed to refresh."""
    db.put(*PATH, {"items": [_item(unit_price=42.0)], "version": 3, "updated_by": "admin-a"})
    PricingService.reset_price_book_cache()
    return db


async def test_an_edited_price_reaches_the_ai_lookup(live):
    assert PricingService.get_item_by_sku("DEM-001")["unit_price"] == 25.0  # the seed, before refreshing
    await PricingService.ensure_fresh()
    assert PricingService.get_item_by_sku("TST-001")["unit_price"] == 42.0
    assert PricingService.get_item_by_sku("DEM-001") is None  # no longer in the price book
    assert PricingService.price_book_version() == 3


async def test_the_refresh_is_not_repeated_within_the_ttl(live):
    spy = AsyncMock(wraps=price_book.read_state)
    with patch.object(price_book, "read_state", spy):
        await PricingService.ensure_fresh()
        await PricingService.ensure_fresh()
    assert spy.await_count == 1


async def test_it_refreshes_again_after_the_ttl(live):
    await PricingService.ensure_fresh()
    live.put(*PATH, {"items": [_item(unit_price=50.0)], "version": 4})
    PricingService._refresh_after = time.monotonic() - 1  # TTL elapsed
    await PricingService.ensure_fresh()
    assert PricingService.get_item_by_sku("TST-001")["unit_price"] == 50.0


async def test_when_firestore_is_down_the_previous_price_book_keeps_serving(live):
    await PricingService.ensure_fresh()
    PricingService._refresh_after = time.monotonic() - 1
    with patch.object(price_book, "read_state", AsyncMock(side_effect=ServiceUnavailable("down"))):
        await PricingService.ensure_fresh()  # must not raise
    assert PricingService.get_item_by_sku("TST-001")["unit_price"] == 42.0
    # and it does not hammer Firestore: the retry is scheduled soon, not immediately
    assert PricingService._refresh_after > time.monotonic()


async def test_with_no_firestore_document_the_seed_keeps_serving(db):
    PricingService.reset_price_book_cache()
    await PricingService.ensure_fresh()
    assert PricingService.get_item_by_sku("DEM-001") is not None
    assert PricingService.price_book_version() == 0


# ── Routes ────────────────────────────────────────────────────────────────────


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


@pytest.mark.parametrize("method", ["get", "put"])
def test_non_admin_is_refused(db, method):
    resp = getattr(_client(role=None), method)("/api/admin/price-book", **({"json": {}} if method == "put" else {}))
    assert resp.status_code == 403 and resp.json()["error_code"] == "ADMIN_REQUIRED"


def test_get_returns_the_seed_with_version_zero(db):
    resp = _client().get("/api/admin/price-book")
    body = resp.json()
    assert resp.status_code == 200 and resp.headers["ETag"] == '"v0"'
    assert (body["source"], body["version"], body["etag"]) == ("seed", 0, '"v0"')
    assert body["item_count"] == len(body["items"]) >= 60


def test_put_requires_if_match(db):
    resp = _client().put("/api/admin/price-book", json={"items": [_item()]})
    assert resp.status_code == 428 and resp.json()["error_code"] == "PRECONDITION_REQUIRED"


def test_a_save_is_visible_to_the_next_read_and_to_the_ai(db):
    client = _client()
    resp = client.put(
        "/api/admin/price-book",
        json={"items": [_item(unit_price=77.0)], "reason": "Prezzi 2026"},
        headers={"If-Match": '"v0"'},
    )
    assert resp.status_code == 200
    assert resp.json()["version"] == 1 and resp.headers["ETag"] == '"v1"'

    again = client.get("/api/admin/price-book").json()
    assert (again["source"], again["version"], again["items"][0]["unit_price"]) == ("firestore", 1, 77.0)
    # the instance that saved serves the new price at once (others within the TTL)
    assert PricingService.get_item_by_sku("TST-001")["unit_price"] == 77.0


def test_a_save_over_a_newer_version_is_a_409(db):
    client = _client()
    client.put("/api/admin/price-book", json={"items": [_item()]}, headers={"If-Match": '"v0"'})
    resp = client.put("/api/admin/price-book", json={"items": [_item(unit_price=1)]}, headers={"If-Match": '"v0"'})
    assert resp.status_code == 409 and resp.json()["error_code"] == "VERSION_CONFLICT"
    assert PricingService.get_item_by_sku("TST-001")["unit_price"] == 10.0


@pytest.mark.parametrize(
    "items",
    [[_item(), _item()], [_item(unit_price=-5)], [_item(sku="no good")]],
)
def test_invalid_payloads_are_422_and_nothing_is_saved(db, items):
    resp = _client().put("/api/admin/price-book", json={"items": items}, headers={"If-Match": '"v0"'})
    assert resp.status_code == 422
    assert db.get_data(*PATH) is None


def test_history_lists_versions_newest_first_without_the_items(db):
    client = _client()
    client.put("/api/admin/price-book", json={"items": [_item()], "reason": "Primo"}, headers={"If-Match": '"v0"'})
    client.put(
        "/api/admin/price-book",
        json={"items": [_item(unit_price=11)], "reason": "Secondo"},
        headers={"If-Match": '"v1"'},
    )
    history = client.get("/api/admin/price-book/history").json()["items"]
    assert [h["version"] for h in history] == [2, 1]
    assert history[0]["reason"] == "Secondo" and history[0]["changed"] == 1 and history[0]["actor_uid"] == "admin-a"
    assert "items" not in history[0]
