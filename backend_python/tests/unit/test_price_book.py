"""Price book on Firestore (Phase 128, Fase 6.1a): schema, versioned store,
the PricingService cache the AI reads, and the /api/admin/price-book routes."""
import asyncio
import time
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from google.api_core.exceptions import ServiceUnavailable
from pydantic import ValidationError
from src.api.routes import admin_price_book as routes
from src.auth.jwt_handler import verify_token
from src.core.exceptions import AppException, PriceBookConflictError, PriceBookSkuInUseError
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


def _book(*extra: dict) -> list[dict]:
    """A realistic price book: the seed (so assembly SKUs stay) plus test lines."""
    return [*price_book.seed_items(), *extra]


def _models(items: list[dict]) -> list[PriceBookItem]:
    return [PriceBookItem(**i) for i in items]


def _history(db: FakeDb) -> list[dict]:
    rows = [d for path, d in db.docs.items() if path[:3] == (*PATH, "history")]
    return sorted(rows, key=lambda d: d["version"])


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
        {"unit_price": float("nan")},
        {"description": "   "},
        {"min_qty": 5, "max_qty": 1},
        {"range_min": 9, "range_max": 3},
        {"tags": ["x" * 41]},
        {"unknown_field": "x"},
    ],
)
def test_invalid_items_are_rejected(bad):
    with pytest.raises(ValidationError):
        PriceBookItem(**_item(**bad))


def test_duplicate_skus_are_rejected_even_when_only_the_case_differs():
    with pytest.raises(ValidationError, match="Duplicate SKU"):
        PutPriceBookBody(items=_models([_item(), _item(sku="tst-001")]))


def test_an_empty_price_book_is_rejected():
    with pytest.raises(ValidationError):
        PutPriceBookBody(items=[])


def test_a_price_book_too_large_for_one_firestore_document_is_rejected():
    big = [_item(sku=f"BIG-{i:04d}", description="d" * 300, tags=["t" * 40] * 20) for i in range(900)]
    with pytest.raises(ValidationError, match="too large"):
        PutPriceBookBody(items=_models(big))


# ── Store ─────────────────────────────────────────────────────────────────────


async def test_without_a_document_the_seed_is_served_as_version_zero(db):
    state = await price_book.read_state(db)
    assert (state.source, state.version, state.problem) == ("seed", 0, None)
    assert state.items == price_book.seed_items()


async def test_a_save_creates_the_document_and_a_history_entry(db):
    items = _models(_book(_item(), _item(sku="TST-002")))
    result = await price_book.save(db, items, 0, "admin-a", NOW, reason="Aggiornamento listino")

    assert (result.version, result.item_count) == (1, len(items))
    stored = db.get_data(*PATH)
    assert stored["version"] == 1 and stored["updated_by"] == "admin-a" and len(stored["items"]) == len(items)
    (entry,) = _history(db)
    assert entry["actor_uid"] == "admin-a" and entry["reason"] == "Aggiornamento listino"
    assert (entry["added"], entry["removed"], entry["changed"]) == (2, 0, 0)


async def test_optional_fields_that_are_unset_are_not_stored(db):
    await price_book.save(db, _models(_book(_item())), 0, "admin-a", NOW)
    line = next(i for i in db.get_data(*PATH)["items"] if i["sku"] == "TST-001")
    assert line.keys() >= {"sku", "unit_price"}
    assert "subcategory" not in line


async def test_a_stale_version_is_a_conflict_and_changes_nothing(db):
    await price_book.save(db, _models(_book(_item())), 0, "admin-a", NOW)
    with pytest.raises(PriceBookConflictError) as exc:
        await price_book.save(db, _models(_book(_item(unit_price=99))), 0, "admin-b", NOW)
    assert exc.value.detail == {"expected_version": 0, "current_version": 1}
    stored = db.get_data(*PATH)["items"]
    assert next(i for i in stored if i["sku"] == "TST-001")["unit_price"] == 10.0
    assert len(_history(db)) == 1


async def test_second_save_counts_what_changed(db):
    await price_book.save(db, _models(_book(_item(), _item(sku="TST-002"))), 0, "a", NOW)
    result = await price_book.save(
        db, _models(_book(_item(unit_price=12.5), _item(sku="TST-003"))), 1, "a", NOW
    )
    assert (result.version, result.added, result.removed, result.changed) == (2, 1, 1, 1)


async def test_a_sku_the_assembly_library_uses_cannot_be_removed(db):
    without = [i for i in price_book.seed_items() if i["sku"] != "DEM-001"]
    with pytest.raises(PriceBookSkuInUseError) as exc:
        await price_book.save(db, _models(without), 0, "admin-a", NOW)
    assert "DEM-001" in exc.value.detail["skus"]
    assert db.get_data(*PATH) is None


async def test_other_skus_can_be_removed(db):
    assembly = price_book.assembly_skus()
    free = next(i for i in price_book.seed_items() if i["sku"] not in assembly)
    without = [i for i in price_book.seed_items() if i["sku"] != free["sku"]]
    result = await price_book.save(db, _models(without), 0, "admin-a", NOW)
    assert result.removed == 1


# ── A document written by another tool (the removed Streamlit editor) ─────────


@pytest.mark.parametrize(
    "document, problem",
    [
        ({"items": [_item()]}, "legacy_document"),  # no version
        ({"items": [_item()], "version": "7"}, "legacy_document"),  # not a number
        ({"items": [_item()], "version": True}, "legacy_document"),
        ({"items": "oops", "version": 2}, "legacy_document"),
        ({"items": [_item(tags=None)], "version": 2}, "invalid_items"),
        ({"items": [_item(unit_price=float("nan"))], "version": 2}, "invalid_items"),
        ({"items": ["not a dict"], "version": 2}, "invalid_items"),
    ],
)
async def test_an_untrusted_document_is_ignored_not_served(db, document, problem):
    db.put(*PATH, document)
    state = await price_book.read_state(db)
    assert (state.source, state.version, state.problem) == ("seed", 0, problem)
    assert state.items == price_book.seed_items()


async def test_saving_over_an_ignored_document_replaces_it_and_never_overwrites_history(db):
    db.put(*PATH, {"items": [_item()]})  # written by another tool: no version
    await price_book.save(db, _models(_book(_item())), 0, "admin-a", NOW)
    db.put(*PATH, {"items": [_item()]})  # the other tool resets it again
    await price_book.save(db, _models(_book(_item(unit_price=11))), 0, "admin-a", NOW)
    assert len(_history(db)) == 2  # both versions "1" survive


# ── The cache the AI reads ────────────────────────────────────────────────────


@pytest.fixture
def live(db):
    """A price book in Firestore and a PricingService that is allowed to refresh."""
    db.put(*PATH, {"items": [_item(unit_price=42.0)], "version": 3, "updated_by": "admin-a", "updated_at": NOW})
    PricingService.reset_price_book_cache()
    return db


async def test_an_edited_price_reaches_the_ai_lookup(live):
    assert PricingService.get_item_by_sku("DEM-001")["unit_price"] == 25.0  # the seed, before refreshing
    await PricingService.ensure_fresh()  # the first load is awaited
    assert PricingService.get_item_by_sku("TST-001")["unit_price"] == 42.0
    assert PricingService.get_item_by_sku("DEM-001") is None  # no longer in the price book
    assert PricingService.price_book_version() == 3


async def test_the_refresh_is_not_repeated_within_the_ttl(live):
    spy = AsyncMock(wraps=price_book.read_state)
    with patch.object(price_book, "read_state", spy):
        await PricingService.ensure_fresh()
        await PricingService.ensure_fresh()
    assert spy.await_count == 1


async def test_after_the_ttl_the_refresh_runs_in_the_background(live):
    await PricingService.ensure_fresh()
    live.put(*PATH, {"items": [_item(unit_price=50.0)], "version": 4, "updated_at": NOW + timedelta(minutes=5)})
    PricingService._refresh_after = time.monotonic() - 1  # TTL elapsed

    gate = asyncio.Event()
    real = price_book.read_state

    async def slow(db):
        await gate.wait()
        return await real(db)

    with patch.object(price_book, "read_state", slow):
        await PricingService.ensure_fresh()  # returns at once: the chat turn is not delayed
        assert PricingService.get_item_by_sku("TST-001")["unit_price"] == 42.0  # still the cached book
        gate.set()
        await PricingService._refresh_task
    assert PricingService.get_item_by_sku("TST-001")["unit_price"] == 50.0


async def test_concurrent_expiries_start_a_single_background_refresh(live):
    await PricingService.ensure_fresh()
    PricingService._refresh_after = time.monotonic() - 1
    spy = AsyncMock(wraps=price_book.read_state)
    with patch.object(price_book, "read_state", spy):
        await asyncio.gather(*(PricingService.ensure_fresh() for _ in range(10)))
        await PricingService._refresh_task
    assert spy.await_count == 1


async def test_when_firestore_is_down_the_previous_price_book_keeps_serving(live):
    await PricingService.ensure_fresh()
    PricingService._refresh_after = time.monotonic() - 1
    with patch.object(price_book, "read_state", AsyncMock(side_effect=ServiceUnavailable("down"))):
        await PricingService.ensure_fresh()  # must not raise
        await PricingService._refresh_task
    assert PricingService.get_item_by_sku("TST-001")["unit_price"] == 42.0
    # and it does not hammer Firestore: the retry is scheduled soon, not immediately
    assert PricingService._refresh_after > time.monotonic()


async def test_a_failed_first_load_does_not_block_every_later_call(db):
    PricingService.reset_price_book_cache()
    with patch.object(price_book, "read_state", AsyncMock(side_effect=ServiceUnavailable("down"))):
        await PricingService.ensure_fresh()  # the one awaited attempt
    assert PricingService.get_item_by_sku("DEM-001") is not None  # the seed serves meanwhile
    PricingService._refresh_after = time.monotonic() - 1
    started = time.monotonic()
    await PricingService.ensure_fresh()  # background now: returns immediately
    assert time.monotonic() - started < 0.5


async def test_an_untrusted_document_keeps_the_book_being_served(live):
    await PricingService.ensure_fresh()
    live.put(*PATH, {"items": [_item(unit_price=1.0)]})  # another tool overwrote it, no version
    PricingService._refresh_after = time.monotonic() - 1
    await PricingService.ensure_fresh()
    await PricingService._refresh_task
    assert PricingService.get_item_by_sku("TST-001")["unit_price"] == 42.0


async def test_a_slow_older_read_never_replaces_a_newer_save(db):
    PricingService.reset_price_book_cache()
    PricingService.apply_price_book([_item(unit_price=2.0)], 2, NOW + timedelta(minutes=1))
    PricingService.apply_price_book([_item(unit_price=1.0)], 1, NOW)  # read started before the save
    assert PricingService.get_item_by_sku("TST-001")["unit_price"] == 2.0


async def test_a_reset_document_with_a_lower_version_but_newer_time_is_accepted(db):
    PricingService.reset_price_book_cache()
    PricingService.apply_price_book([_item(unit_price=2.0)], 5, NOW)
    PricingService.apply_price_book([_item(unit_price=3.0)], 1, NOW + timedelta(minutes=1))
    assert PricingService.get_item_by_sku("TST-001")["unit_price"] == 3.0


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


def _put(client, items, version="v0", **extra):
    return client.put(
        "/api/admin/price-book", json={"items": items, **extra}, headers={"If-Match": f'"{version}"'}
    )


@pytest.mark.parametrize("method", ["get", "put"])
def test_non_admin_is_refused(db, method):
    resp = getattr(_client(role=None), method)("/api/admin/price-book", **({"json": {}} if method == "put" else {}))
    assert resp.status_code == 403 and resp.json()["error_code"] == "ADMIN_REQUIRED"


def test_get_returns_the_seed_with_version_zero(db):
    resp = _client().get("/api/admin/price-book")
    body = resp.json()
    assert resp.status_code == 200 and resp.headers["ETag"] == '"v0"'
    assert (body["source"], body["version"], body["etag"]) == ("seed", 0, '"v0"')
    assert body["ignored_document"] is None
    assert body["item_count"] == len(body["items"]) >= 60


def test_get_tells_when_a_foreign_document_was_ignored(db):
    db.put(*PATH, {"items": [_item(tags=None)]})
    body = _client().get("/api/admin/price-book").json()
    assert (body["source"], body["version"], body["ignored_document"]) == ("seed", 0, "legacy_document")


def test_put_requires_if_match(db):
    resp = _client().put("/api/admin/price-book", json={"items": _book()})
    assert resp.status_code == 428 and resp.json()["error_code"] == "PRECONDITION_REQUIRED"


def test_a_save_is_visible_to_the_next_read_and_to_the_ai(db):
    client = _client()
    resp = _put(client, _book(_item(unit_price=77.0)), reason="Prezzi 2026")
    assert resp.status_code == 200
    assert resp.json()["version"] == 1 and resp.headers["ETag"] == '"v1"'

    again = client.get("/api/admin/price-book").json()
    assert (again["source"], again["version"]) == ("firestore", 1)
    assert next(i for i in again["items"] if i["sku"] == "TST-001")["unit_price"] == 77.0
    # the instance that saved serves the new price at once (others within the TTL)
    assert PricingService.get_item_by_sku("TST-001")["unit_price"] == 77.0


def test_a_save_over_a_newer_version_is_a_409(db):
    client = _client()
    _put(client, _book(_item()))
    resp = _put(client, _book(_item(unit_price=1)))
    assert resp.status_code == 409 and resp.json()["error_code"] == "VERSION_CONFLICT"
    assert PricingService.get_item_by_sku("TST-001")["unit_price"] == 10.0


def test_removing_an_assembly_sku_is_422_with_the_list(db):
    items = [i for i in price_book.seed_items() if i["sku"] != "DEM-001"]
    resp = _put(_client(), items)
    body = resp.json()
    assert resp.status_code == 422 and body["error_code"] == "PRICE_BOOK_SKU_IN_USE"
    assert "DEM-001" in body["detail"]["skus"]
    assert db.get_data(*PATH) is None


@pytest.mark.parametrize(
    "items",
    [
        [_item(), _item()],
        [_item(unit_price=-5)],
        [_item(sku="no good")],
        [_item(sku=f"BIG-{i:04d}", description="d" * 300, tags=["t" * 40] * 20) for i in range(900)],
    ],
)
def test_invalid_payloads_are_422_and_nothing_is_saved(db, items):
    resp = _put(_client(), items)
    assert resp.status_code == 422
    assert db.get_data(*PATH) is None


def test_history_lists_versions_newest_first_without_the_items(db):
    client = _client()
    _put(client, _book(_item()), reason="Primo")
    _put(client, _book(_item(unit_price=11)), version="v1", reason="Secondo")
    history = client.get("/api/admin/price-book/history").json()["items"]
    assert [h["version"] for h in history] == [2, 1]
    assert history[0]["reason"] == "Secondo" and history[0]["changed"] == 1 and history[0]["actor_uid"] == "admin-a"
    assert "items" not in history[0]
