"""Admin console content API (Phase 128, Fase 6.1b): portfolio, testimonials,
batches (read-only + sync), KPIs and the GDPR monitor."""
import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from src.api.routes import admin_batches, admin_dashboard, admin_portfolio, admin_testimonials, lifecycle_routes
from src.auth.jwt_handler import verify_token
from src.core.config import settings
from src.core.exceptions import AppException
from src.core.rate_limit import limiter
from src.schemas.admin_content import portfolio_blob_path
from src.schemas.internal import UserSession
from src.services import admin_content, admin_kpis, batch_sync, lifecycle_lock
from src.services.account_lifecycle_service import LifecycleRunResult
from src.services.client_profile import ClientProfile
from tests.unit.firestore_fakes import FakeDb, FakeTransaction

BUCKET = "test-bucket.appspot.com"
NOW = datetime(2026, 10, 14, 12, 0, tzinfo=UTC)  # a Wednesday
GOOD_IMAGE = f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}/o/portfolio%2F1700_bagno.webp?alt=media"
LEGACY_IMAGE = f"https://storage.googleapis.com/{BUCKET}/portfolio/1700_cucina.jpg"
BACKSLASH = chr(92)
FB = "https://firebasestorage.googleapis.com"


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()
    for module in (admin_portfolio, admin_testimonials, admin_batches, admin_dashboard):
        monkeypatch.setattr(module, "get_async_firestore_client", lambda f=fake: f)
    monkeypatch.setattr(settings, "FIREBASE_STORAGE_BUCKET", BUCKET)
    for module in (admin_portfolio, admin_testimonials, admin_dashboard):
        monkeypatch.setattr(module, "emit_audit_event", lambda *a, **k: None)

    async def transact(_db, body):
        return await body(FakeTransaction(fake))

    monkeypatch.setattr(batch_sync, "_transact", transact)
    monkeypatch.setattr(lifecycle_lock, "_transact", transact)
    admin_dashboard._kpi_cache = None
    limiter.reset()  # the 3/hour GDPR limit is per process: each test starts fresh
    return fake


def _client(role: str | None = "admin") -> TestClient:
    app = FastAPI()
    for module in (admin_portfolio, admin_testimonials, admin_batches, admin_dashboard):
        app.include_router(module.router)

    @app.exception_handler(AppException)
    async def _handler(_request: Request, exc: AppException):
        return JSONResponse(status_code=exc.status_code, content={"error_code": exc.error_code, "detail": exc.detail})

    async def _session():
        return UserSession(
            uid="admin-a", email="a@syd.it", is_authenticated=True, claims={"role": role} if role else {}
        )

    app.dependency_overrides[verify_token] = _session
    return TestClient(app)


# ── Authorisation ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "method, path",
    [
        ("get", "/api/admin/portfolio"),
        ("post", "/api/admin/portfolio"),
        ("patch", "/api/admin/portfolio/p1"),
        ("delete", "/api/admin/portfolio/p1"),
        ("get", "/api/admin/testimonials"),
        ("post", "/api/admin/testimonials/t1/moderate"),
        ("get", "/api/admin/batches"),
        ("get", "/api/admin/batches/b1"),
        ("get", "/api/admin/kpis"),
        ("get", "/api/admin/gdpr/status"),
        ("post", "/api/admin/gdpr/lifecycle/run"),
    ],
)
def test_every_route_needs_the_admin_role(db, method, path):
    resp = getattr(_client(role=None), method)(path, **({"json": {}} if method in ("post", "patch") else {}))
    assert resp.status_code == 403 and resp.json()["error_code"] == "ADMIN_REQUIRED"


# ── Portfolio ─────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "url, expected",
    [
        (GOOD_IMAGE, "portfolio/1700_bagno.webp"),
        (LEGACY_IMAGE, "portfolio/1700_cucina.jpg"),
        (f"http://firebasestorage.googleapis.com/v0/b/{BUCKET}/o/portfolio%2Fx.webp", None),  # not https
        ("https://firebasestorage.googleapis.com/v0/b/other-bucket/o/portfolio%2Fx.webp", None),  # not our bucket
        (f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}/o/renders%2Fx.webp", None),  # not the portfolio folder
        (f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}/o/portfolio%2F..%2Frenders%2Fx.webp", None),
        (f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}/o/portfolio%2Fsub%2Fx.webp", None),  # nested
        (f"https://evil.example.com/v0/b/{BUCKET}/o/portfolio%2Fx.webp", None),
        ("javascript:alert(1)", None),
        ("", None),
        # parser differentials: Python and a browser would read these differently
        (f"https://evil.example.com{BACKSLASH}@firebasestorage.googleapis.com/v0/b/{BUCKET}/o/portfolio%2Fx.webp", None),
        (f"{FB}{BACKSLASH}@evil.example.com/v0/b/{BUCKET}/o/portfolio%2Fx.webp", None),
        (f"https://user:pw@firebasestorage.googleapis.com/v0/b/{BUCKET}/o/portfolio%2Fx.webp", None),
        (f"https://firebasestorage.googleapis.com:444/v0/b/{BUCKET}/o/portfolio%2Fx.webp", None),
        (f"https://FIREBASESTORAGE.googleapis.com/v0/b/{BUCKET}/o/portfolio%2Fx.webp", None),
        (f"{GOOD_IMAGE.split('?')[0]}#@evil.example.com", None),
        (f"{GOOD_IMAGE}&x=1", None),
        (f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}/o/portfolio%2Fx y.webp", None),
        (GOOD_IMAGE + chr(10), None),
        (f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}/o/portfolio%252F..%252Fx.webp", None),  # double encoding
        (f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}/o/portfolio%2F%2e%2e%2Fx.webp", None),
        (f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}/o/portfolio%2Fx{chr(233)}.webp", None),  # non-ASCII
        (f"https://storage.googleapis.com/{BUCKET}/portfolio/x.jpg?token=abc", None),
        (f"https://storage.googleapis.com/{BUCKET}/portfolio/", None),
    ],
)
def test_only_images_in_our_portfolio_folder_are_accepted(url, expected):
    assert portfolio_blob_path(url, BUCKET) == expected


def _project(**overrides):
    body = {
        "title": "Bagno Trastevere",
        "category": "Bagno",
        "location": "Roma",
        "description": "Rifacimento completo",
        "stats": {"area": "6 mq", "duration": "3 settimane", "budget": "€12k"},
        "image_url": GOOD_IMAGE,
        "active": True,
    }
    body.update(overrides)
    return body


def test_create_assigns_the_next_order_and_lists_hidden_projects_too(db):
    client = _client()
    first = client.post("/api/admin/portfolio", json=_project())
    second = client.post("/api/admin/portfolio", json=_project(title="Cucina", active=False, image_url=LEGACY_IMAGE))
    assert first.status_code == second.status_code == 201
    assert (first.json()["order"], second.json()["order"]) == (1, 2)

    listing = client.get("/api/admin/portfolio").json()
    assert [p["title"] for p in listing["items"]] == ["Bagno Trastevere", "Cucina"]
    assert listing["visible"] == 1


@pytest.mark.parametrize(
    "bad",
    [
        {"image_url": "https://evil.example.com/x.png"},
        {"image_url": f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}/o/renders%2Fx.png"},
    ],
)
def test_a_foreign_image_url_is_refused(db, bad):
    resp = _client().post("/api/admin/portfolio", json=_project(**bad))
    assert resp.status_code == 422 and resp.json()["error_code"] == "INVALID_PORTFOLIO_IMAGE"
    assert not db.docs


@pytest.mark.parametrize("bad", [{"category": "Giardino"}, {"title": "  "}, {"surprise": 1}, {"image_url": ""}])
def test_invalid_project_fields_are_422(db, bad):
    assert _client().post("/api/admin/portfolio", json=_project(**bad)).status_code == 422


def test_patch_changes_only_what_was_sent(db):
    client = _client()
    pid = client.post("/api/admin/portfolio", json=_project()).json()["id"]
    resp = client.patch(f"/api/admin/portfolio/{pid}", json={"active": False})
    assert resp.status_code == 200
    body = resp.json()
    assert body["active"] is False and body["title"] == "Bagno Trastevere" and body["order"] == 1


def test_patch_needs_something_to_change_and_an_existing_project(db):
    client = _client()
    assert client.patch("/api/admin/portfolio/p1", json={}).status_code == 422
    assert client.patch("/api/admin/portfolio/missing", json={"active": True}).status_code == 404


def test_replacing_the_image_removes_the_old_file(db, monkeypatch):
    removed: list[str] = []
    monkeypatch.setattr(admin_content, "_delete_blob_sync", removed.append)
    client = _client()
    pid = client.post("/api/admin/portfolio", json=_project()).json()["id"]
    resp = client.patch(f"/api/admin/portfolio/{pid}", json={"image_url": LEGACY_IMAGE})
    assert resp.status_code == 200 and removed == ["portfolio/1700_bagno.webp"]
    # a foreign replacement is refused before anything is touched
    assert client.patch(f"/api/admin/portfolio/{pid}", json={"image_url": "https://evil.example.com/a.png"}).status_code == 422
    assert removed == ["portfolio/1700_bagno.webp"]


def test_delete_removes_the_project_and_its_image(db, monkeypatch):
    removed: list[str] = []
    monkeypatch.setattr(admin_content, "_delete_blob_sync", removed.append)
    client = _client()
    pid = client.post("/api/admin/portfolio", json=_project()).json()["id"]
    assert client.delete(f"/api/admin/portfolio/{pid}").status_code == 204
    assert client.get("/api/admin/portfolio").json()["items"] == []
    assert removed == ["portfolio/1700_bagno.webp"]
    assert client.delete(f"/api/admin/portfolio/{pid}").status_code == 404


def test_a_storage_failure_does_not_fail_the_delete(db, monkeypatch):
    from google.api_core.exceptions import ServiceUnavailable

    monkeypatch.setattr(admin_content, "_delete_blob_sync", MagicMock(side_effect=ServiceUnavailable("down")))
    client = _client()
    pid = client.post("/api/admin/portfolio", json=_project()).json()["id"]
    assert client.delete(f"/api/admin/portfolio/{pid}").status_code == 204


@pytest.mark.parametrize("field", ["title", "description", "stats", "image_url", "active", "category", "location"])
def test_a_patch_cannot_null_a_field(db, field):
    client = _client()
    pid = client.post("/api/admin/portfolio", json=_project()).json()["id"]
    resp = client.patch(f"/api/admin/portfolio/{pid}", json={field: None})
    assert resp.status_code == 422
    assert db.get_data("portfolio_projects", pid)["title"] == "Bagno Trastevere"


def test_one_malformed_document_does_not_blank_the_public_gallery():
    from pydantic import ValidationError
    from src.api.routes import content_routes

    good = content_routes._portfolio_from_doc("p1", {"title": "T", "category": "Bagno", "location": "Roma",
                                                   "stats": None, "description": None, "image_url": GOOD_IMAGE})
    assert (good.stats.area, good.description) == ("", "") and good.image is None  # bucket unset here
    with pytest.raises(ValidationError):
        content_routes._portfolio_from_doc("p2", {"title": ["not", "a", "string"]})


def _two_projects_sharing_an_image(client):
    shared = GOOD_IMAGE
    first = client.post("/api/admin/portfolio", json=_project(image_url=shared)).json()["id"]
    # the same object, spelled differently: lower-case %2f, no ?alt=media
    alias = f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}/o/portfolio%2F1700_bagno.webp"
    second = client.post("/api/admin/portfolio", json=_project(title="Altro", image_url=alias)).json()["id"]
    return first, second


def test_an_image_still_used_by_another_project_is_not_deleted(db, monkeypatch):
    removed: list[str] = []
    monkeypatch.setattr(admin_content, "_delete_blob_sync", removed.append)
    client = _client()
    first, second = _two_projects_sharing_an_image(client)

    assert client.delete(f"/api/admin/portfolio/{first}").status_code == 204
    assert removed == []  # the other project still shows it
    assert client.delete(f"/api/admin/portfolio/{second}").status_code == 204
    assert removed == ["portfolio/1700_bagno.webp"]  # the last user removes the file


def test_replacing_a_shared_image_keeps_the_file_for_the_other_project(db, monkeypatch):
    removed: list[str] = []
    monkeypatch.setattr(admin_content, "_delete_blob_sync", removed.append)
    client = _client()
    first, _second = _two_projects_sharing_an_image(client)
    assert client.patch(f"/api/admin/portfolio/{first}", json={"image_url": LEGACY_IMAGE}).status_code == 200
    assert removed == []


def test_saving_the_same_image_again_deletes_nothing(db, monkeypatch):
    removed: list[str] = []
    monkeypatch.setattr(admin_content, "_delete_blob_sync", removed.append)
    client = _client()
    pid = client.post("/api/admin/portfolio", json=_project()).json()["id"]
    respelled = f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}/o/portfolio%2F1700_bagno.webp"
    assert client.patch(f"/api/admin/portfolio/{pid}", json={"image_url": respelled}).status_code == 200
    assert removed == []


# ── Testimonials ──────────────────────────────────────────────────────────────


def _review(db, rid, status="pending", created=NOW, **extra):
    db.put("testimonials", rid, {"name": "Anna", "location": "Roma", "text": "Ottimo lavoro!", "rating": 5,
                                  "status": status, "createdAt": created, "userId": "secret-uid", **extra})


def test_testimonials_are_listed_by_status_newest_first_with_stats(db):
    _review(db, "t1", created=NOW - timedelta(days=2))
    _review(db, "t2", created=NOW)
    _review(db, "t3", status="approved")
    body = _client().get("/api/admin/testimonials").json()
    assert [t["id"] for t in body["items"]] == ["t2", "t1"]
    assert body["stats"] == {"pending": 2, "approved": 1, "rejected": 0}
    assert "userId" not in body["items"][0] and "secret-uid" not in str(body)
    approved = _client().get("/api/admin/testimonials?status=approved").json()
    assert [t["id"] for t in approved["items"]] == ["t3"]
    assert _client().get("/api/admin/testimonials?status=bogus").status_code == 422


def test_the_testimonial_cap_keeps_the_newest(db):
    for i in range(5):
        _review(db, f"t{i}", created=NOW - timedelta(days=5 - i))
    items = asyncio.run(admin_content.list_testimonials(db, "pending", limit=2))
    assert [t.id for t in items] == ["t4", "t3"]


def test_approve_publishes_and_reject_takes_it_down(db):
    _review(db, "t1")
    client = _client()
    resp = client.post("/api/admin/testimonials/t1/moderate", json={"decision": "approve", "notes": "ok"})
    assert resp.status_code == 200
    assert resp.json() == {"id": "t1", "status": "approved", "stats": {"pending": 0, "approved": 1, "rejected": 0}}
    stored = db.get_data("testimonials", "t1")
    assert stored["status"] == "approved" and stored["reviewed_by"] == "admin-a" and stored["admin_notes"] == "ok"

    resp = client.post("/api/admin/testimonials/t1/moderate", json={"decision": "reject"})
    assert resp.json()["status"] == "rejected"  # an approved review can be unpublished later


def test_moderating_needs_a_known_review_and_a_valid_decision(db):
    client = _client()
    assert client.post("/api/admin/testimonials/nope/moderate", json={"decision": "approve"}).status_code == 404
    _review(db, "t1")
    assert client.post("/api/admin/testimonials/t1/moderate", json={"decision": "maybe"}).status_code == 422


# ── Batches ───────────────────────────────────────────────────────────────────


@pytest.fixture
def profiles(monkeypatch):
    async def fake_profile(uid: str) -> ClientProfile:
        return ClientProfile(name="Mario Rossi", email="mario@example.it") if uid == "uid-1" else ClientProfile()

    monkeypatch.setattr(admin_batches, "get_client_profile", fake_profile)


def _batch(db, bid="b1", status="submitted", submitted=NOW, projects=None):
    db.put("quote_batches", bid, {
        "user_id": "uid-1", "status": status, "total_projects": 2, "batch_grand_total": 1000.0,
        "batch_subtotal": 820.0, "potential_savings": 50.0, "submitted_at": submitted,
        "aggregation_preview": [{"adjustment_type": "merge_quantities", "savings": 50.0}],
        "projects": projects or [
            {"project_id": "pa", "project_name": "Bagno", "status": "approved", "item_count": 3, "subtotal": 400.0},
            {"project_id": "pb", "project_name": "Cucina", "status": "draft", "item_count": 2, "subtotal": 420.0},
        ],
    })


def test_batches_list_shows_the_client_and_progress(db, profiles):
    _batch(db, "b1", submitted=NOW - timedelta(days=1))
    _batch(db, "b2", submitted=NOW)
    _batch(db, "b3", status="approved")
    items = _client().get("/api/admin/batches").json()["items"]
    assert [i["batch_id"] for i in items] == ["b2", "b1"]  # open only, newest first
    assert items[0]["client_display_name"] == "Mario Rossi" and items[0]["client_email"] == "mario@example.it"
    assert (items[0]["total_projects"], items[0]["decided_projects"]) == (2, 1)
    closed = _client().get("/api/admin/batches?scope=closed").json()["items"]
    assert [i["batch_id"] for i in closed] == ["b3"]
    assert _client().get("/api/admin/batches?scope=bogus").status_code == 422


def test_the_batch_cap_keeps_the_newest(db, profiles, monkeypatch):
    monkeypatch.setattr(admin_batches, "_LIST_CAP", 2)
    for i in range(4):
        _batch(db, f"b{i}", submitted=NOW - timedelta(days=4 - i))
    items = _client().get("/api/admin/batches").json()["items"]
    assert [i["batch_id"] for i in items] == ["b3", "b2"]


def test_batch_detail_shows_the_live_state_of_each_quote(db, profiles):
    _batch(db)
    db.put("projects", "pa", "private_data", "quote", {
        "doc_type": "quote", "status": "sent", "delivery_status": "delivered", "quote_number": "PRV-2026-0001",
        "items": [{"sku": "A"}] * 3, "financials": {"grand_total": 488.0},
    })
    body = _client().get("/api/admin/batches/b1").json()
    assert body["client_display_name"] == "Mario Rossi" and body["potential_savings"] == 50.0
    pa, pb = body["projects"]
    assert (pa["quote_status"], pa["delivery_status"], pa["quote_number"], pa["grand_total"]) == (
        "sent", "delivered", "PRV-2026-0001", 488.0)
    assert pa["batch_status"] == "approved"
    # no quote document for pb: the batch snapshot is all there is
    assert (pb["quote_status"], pb["item_count"], pb["batch_status"]) == (None, 2, "draft")
    assert body["aggregation_preview"][0]["adjustment_type"] == "merge_quantities"
    assert _client().get("/api/admin/batches/nope").status_code == 404


# ── Batch sync ────────────────────────────────────────────────────────────────


def _quote_in_batch(db, pid, status="pending_review", batch_id="b1"):
    db.put("projects", pid, "private_data", "quote",
           {"doc_type": "quote", "status": status, "request": {"batch_id": batch_id}})


@pytest.mark.parametrize(
    "statuses, expected",
    [
        (["approved", "approved"], "approved"),
        (["rejected", "rejected"], "rejected"),
        (["approved", "rejected"], "partially_approved"),
        (["approved", "draft"], "submitted"),
        (["draft", "draft"], "submitted"),
    ],
)
def test_batch_status_follows_its_projects(statuses, expected):
    assert batch_sync.batch_status_from([{"status": s} for s in statuses]) == expected


@pytest.mark.parametrize(
    "quote_status, expected",
    [("approved", "approved"), ("sent", "approved"), ("rejected", "rejected"),
     ("pending_review", "draft"), ("in_review", "draft"), ("draft", "draft"), (None, "draft")],
)
def test_a_quote_status_maps_to_a_batch_project_status(quote_status, expected):
    assert batch_sync.project_status_from(quote_status) == expected


async def test_the_batch_follows_the_quote_status(db):
    _batch(db)
    _quote_in_batch(db, "pb", status="approved")
    assert await batch_sync.sync_project_decision(db, "pb") is True
    stored = db.get_data("quote_batches", "b1")
    assert [p["status"] for p in stored["projects"]] == ["approved", "approved"]
    assert stored["status"] == "approved"

    _quote_in_batch(db, "pb", status="in_review")  # reopened
    await batch_sync.sync_project_decision(db, "pb")
    assert db.get_data("quote_batches", "b1")["status"] == "submitted"


@pytest.mark.parametrize("quote_status", ["in_review", "approved", "rejected", "sent"])
def test_a_quote_already_sent_stays_approved_in_the_batch_while_it_is_revised(quote_status):
    assert batch_sync.project_status_from(quote_status, sent_before=True) == "approved"


async def test_revising_a_sent_quote_does_not_reopen_its_batch(db):
    _batch(db)
    _quote_in_batch(db, "pb", status="approved")
    await batch_sync.sync_project_decision(db, "pb")
    db.put("projects", "pb", "private_data", "quote",
           {"doc_type": "quote", "status": "in_review", "sent_at": "2026-10-11T10:25:00Z",
            "request": {"batch_id": "b1"}})
    await batch_sync.sync_project_decision(db, "pb")
    assert db.get_data("quote_batches", "b1")["status"] == "approved"


async def test_a_late_sync_cannot_leave_the_batch_opposite_to_the_quote(db):
    """Approve then reopen in quick succession: whichever sync runs last (or twice),
    the batch reflects the quote as it is NOW, not the decision it was triggered by."""
    _batch(db)
    _quote_in_batch(db, "pb", status="in_review")  # already reopened
    await batch_sync.sync_project_decision(db, "pb")  # the 'approve' sync, arriving late
    stored = db.get_data("quote_batches", "b1")
    assert stored["projects"][1]["status"] == "draft" and stored["status"] == "submitted"


async def test_nothing_internal_is_written_to_the_client_readable_batch(db):
    _batch(db)
    _quote_in_batch(db, "pb", status="rejected")
    await batch_sync.sync_project_decision(db, "pb")
    assert "admin_notes" not in db.get_data("quote_batches", "b1")["projects"][1]


async def test_quotes_outside_a_batch_or_with_a_draft_batch_are_left_alone(db):
    db.put("projects", "solo", "private_data", "quote", {"doc_type": "quote", "request": {}})
    assert await batch_sync.sync_project_decision(db, "solo") is False
    assert await batch_sync.sync_project_decision(db, "missing") is False
    _batch(db, status="draft")
    _quote_in_batch(db, "pb", status="approved")
    assert await batch_sync.sync_project_decision(db, "pb") is False


@pytest.mark.parametrize("error", ["ServiceUnavailable", "ValueError"])
async def test_a_sync_failure_never_fails_the_caller(db, monkeypatch, error):
    from google.api_core.exceptions import ServiceUnavailable

    raised = ServiceUnavailable("down") if error == "ServiceUnavailable" else ValueError("Failed to commit")
    monkeypatch.setattr(batch_sync, "sync_project_decision", AsyncMock(side_effect=raised))
    await batch_sync.sync_project_decision_safely(db, "pb")  # must not raise


# ── KPIs ──────────────────────────────────────────────────────────────────────


def _quote(db, pid, status, total, updated, **extra):
    db.put("projects", pid, "private_data", "quote", {
        "doc_type": "quote", "status": status, "updated_at": updated, "quote_number": f"PRV-2026-{pid}",
        "client_snapshot": {"display_name": f"Cliente {pid}"}, "financials": {"grand_total": total}, **extra,
    })


def test_week_buckets_are_monday_anchored_and_cover_eight_weeks():
    assert admin_kpis.week_start(NOW).isoformat() == "2026-10-12"  # Monday
    times = [NOW, NOW - timedelta(days=1), NOW - timedelta(weeks=1), NOW - timedelta(weeks=20)]
    weeks = admin_kpis.weekly_buckets(times, NOW)
    assert len(weeks) == 8 and weeks[-1].week_start == "2026-10-12"
    assert [w.approvals for w in weeks][-2:] == [1, 2]  # last week: 1; this week: Wednesday and Tuesday
    assert sum(w.approvals for w in weeks) == 3  # the 20-week-old one is outside the window


def test_italian_daylight_saving_dates():
    assert admin_kpis.rome_offset(datetime(2026, 3, 29, 0, 59, tzinfo=UTC)) == timedelta(hours=1)
    assert admin_kpis.rome_offset(datetime(2026, 3, 29, 1, 0, tzinfo=UTC)) == timedelta(hours=2)
    assert admin_kpis.rome_offset(datetime(2026, 10, 25, 0, 59, tzinfo=UTC)) == timedelta(hours=2)
    assert admin_kpis.rome_offset(datetime(2026, 10, 25, 1, 0, tzinfo=UTC)) == timedelta(hours=1)


@pytest.mark.parametrize(
    "moment, week",
    [
        # summer (UTC+2): Sunday 22:30 UTC is already Monday 00:30 in Rome
        (datetime(2026, 10, 11, 22, 30, tzinfo=UTC), "2026-10-12"),
        (datetime(2026, 10, 11, 21, 30, tzinfo=UTC), "2026-10-05"),
        # winter (UTC+1): Sunday 23:30 UTC is Monday 00:30; 22:30 UTC is still Sunday 23:30
        (datetime(2026, 1, 11, 23, 30, tzinfo=UTC), "2026-01-12"),
        (datetime(2026, 1, 11, 22, 30, tzinfo=UTC), "2026-01-05"),
    ],
)
def test_weeks_follow_italian_local_time(moment, week):
    assert admin_kpis.week_start(moment).isoformat() == week


def test_the_query_window_starts_at_the_beginning_of_an_italian_week():
    start = admin_kpis.week_start_instant(admin_kpis.week_start(NOW) - timedelta(weeks=7))
    assert start == datetime(2026, 8, 23, 22, 0, tzinfo=UTC)  # Monday 24 Aug 00:00 CEST


async def test_kpis_count_sum_and_rank(db):
    _quote(db, "0001", "pending_review", 100.0, NOW)
    _quote(db, "0002", "in_review", 250.5, NOW)
    _quote(db, "0003", "draft", 999.0, NOW)  # drafts are not "pending"
    _quote(db, "0004", "approved", 300.0, NOW - timedelta(days=1), review={"approved_at": NOW - timedelta(days=1)})
    _quote(db, "0005", "sent", 500.0, NOW, review={"approved_at": NOW - timedelta(days=9)})
    _quote(db, "0006", "rejected", 10.0, NOW)
    _review(db, "t1")
    kpis = await admin_kpis.compute_kpis(db, NOW)
    assert kpis.by_status == {"draft": 1, "pending_review": 1, "in_review": 1, "approved": 1, "sent": 1, "rejected": 1}
    assert kpis.pending_value == 350.5 and kpis.pending_truncated is False
    assert kpis.testimonials.pending == 1
    # approved yesterday (this week) and 9 days ago (last week)
    assert [w.approvals for w in kpis.weekly_approvals][-2:] == [1, 1]
    assert [r.quote_number for r in kpis.recent_approvals] == ["PRV-2026-0004", "PRV-2026-0005"]
    assert kpis.recent_approvals[0].client_display_name == "Cliente 0004"


def test_the_kpi_endpoint_is_cached_for_a_short_while(db):
    client = _client()
    first = client.get("/api/admin/kpis").json()
    _quote(db, "0001", "pending_review", 100.0, NOW)
    assert client.get("/api/admin/kpis").json() == first  # served from the 30 s cache
    admin_dashboard._kpi_cache = None
    assert client.get("/api/admin/kpis").json()["by_status"]["pending_review"] == 1


# ── GDPR ──────────────────────────────────────────────────────────────────────


def test_gdpr_status_lists_the_phases_and_whether_the_scheduler_secret_exists(db, monkeypatch):
    monkeypatch.setattr(settings, "LIFECYCLE_SECRET", "x" * 40)
    body = _client().get("/api/admin/gdpr/status").json()
    assert [(p["phase"], p["months_inactive"]) for p in body["phases"]] == [(1, 12), (2, 13), (3, 24)]
    assert body["scheduler_secret_configured"] is True


def _lifecycle_service(monkeypatch, result):
    service = MagicMock()
    service.run_lifecycle_pass = AsyncMock(return_value=result)
    monkeypatch.setattr(admin_dashboard, "get_account_lifecycle_service", lambda: service)
    monkeypatch.setattr(lifecycle_routes, "get_account_lifecycle_service", lambda: service)
    return service


def test_the_admin_can_run_the_lifecycle_pass_without_the_shared_secret(db, monkeypatch):
    service = _lifecycle_service(monkeypatch, LifecycleRunResult(warned=2, disabled=1, anonymized=0, errors=[]))
    resp = _client().post("/api/admin/gdpr/lifecycle/run")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok", "warned": 2, "disabled": 1, "anonymized": 0, "errors": []}
    assert service.run_lifecycle_pass.await_count == 1
    assert db.get_data("app_config", "gdpr_lifecycle_lock") is None  # the lease is released


def test_raw_error_text_never_reaches_the_browser(db, monkeypatch):
    errors = ["warn:uid-123:SMTP refused mario@example.it", "warn:uid-456:timeout", "disable:uid-789:boom"]
    _lifecycle_service(monkeypatch, LifecycleRunResult(errors=errors))
    body = _client().post("/api/admin/gdpr/lifecycle/run").json()
    assert body["status"] == "partial_errors"
    assert body["errors"] == ["disable: 1 errori (dettagli nei log del server)", "warn: 2 errori (dettagli nei log del server)"]
    assert "uid-" not in str(body) and "example.it" not in str(body)


def test_two_runs_cannot_overlap(db, monkeypatch):
    inner: dict = {}

    async def second_run_while_first_is_running(*_a, **_k):
        # the scheduler's call arrives while the admin's run is in progress
        inner["admin"] = _client().post("/api/admin/gdpr/lifecycle/run")
        app = FastAPI()
        app.include_router(lifecycle_routes.router)
        monkeypatch.setattr(lifecycle_routes.settings, "LIFECYCLE_SECRET", "s" * 40)
        inner["scheduler"] = TestClient(app).post("/internal/lifecycle/run", headers={"X-Lifecycle-Secret": "s" * 40})
        return LifecycleRunResult(warned=1)

    service = _lifecycle_service(monkeypatch, LifecycleRunResult())
    service.run_lifecycle_pass = AsyncMock(side_effect=second_run_while_first_is_running)
    monkeypatch.setattr(lifecycle_routes, "get_async_firestore_client", lambda: db)

    # the "first" run is the admin's own
    first = _client().post("/api/admin/gdpr/lifecycle/run")
    assert first.status_code == 200 and first.json()["warned"] == 1
    assert inner["admin"].status_code == 409 and inner["admin"].json()["error_code"] == "LIFECYCLE_ALREADY_RUNNING"
    assert inner["scheduler"].status_code == 200 and inner["scheduler"].json()["status"] == "already_running"
    assert service.run_lifecycle_pass.await_count == 1  # nobody was emailed twice


async def test_an_expired_lease_does_not_block_the_next_run(db):
    db.put("app_config", "gdpr_lifecycle_lock", {"locked_until": datetime.now(UTC) - timedelta(minutes=1), "token": "old"})
    async with lifecycle_lock.lifecycle_lease(db):
        assert db.get_data("app_config", "gdpr_lifecycle_lock")["token"] != "old"
    assert db.get_data("app_config", "gdpr_lifecycle_lock") is None
