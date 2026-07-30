"""Tests for the testimonial name/location fields added alongside the frontend
review form (SYD homepage refinements round 2).

``TestimonialSubmit.name``/``location`` are optional on the API even though the
form requires both: this is what keeps ``test_route_attr_bugs.py``'s
text+rating-only regression test passing unchanged.
"""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from src.auth.jwt_handler import verify_token
from src.schemas.internal import UserSession


@pytest.fixture
def content_client():
    from src.api.routes.content_routes import router

    app = FastAPI()
    app.include_router(router)

    async def _override():
        return UserSession(
            uid="user-123",
            email="mario@example.com",
            is_anonymous=False,
            claims={"name": "Mario Rossi"},
        )

    app.dependency_overrides[verify_token] = _override
    return TestClient(app)


def test_submit_testimonial_stores_name_and_location(content_client):
    captured = {}

    def _fake_add(payload):
        captured.update(payload)

    fake_db = MagicMock()
    fake_db.collection.return_value.add.side_effect = _fake_add

    with patch(
        "src.api.routes.content_routes.get_firestore_client", return_value=fake_db
    ):
        resp = content_client.post(
            "/api/content/testimonials",
            json={
                "name": "Giulia Verdi",
                "location": "Firenze",
                "text": "Servizio impeccabile dall'inizio alla fine!",
                "rating": 5,
            },
        )

    assert resp.status_code == 201, resp.text
    assert captured["name"] == "Giulia Verdi"
    assert captured["location"] == "Firenze"


def test_submit_testimonial_without_name_falls_back_to_claim(content_client):
    """The form always sends a name, but the API stays tolerant of clients that
    don't — falling back to the Firebase claim, same as before these fields existed.
    """
    captured = {}

    def _fake_add(payload):
        captured.update(payload)

    fake_db = MagicMock()
    fake_db.collection.return_value.add.side_effect = _fake_add

    with patch(
        "src.api.routes.content_routes.get_firestore_client", return_value=fake_db
    ):
        resp = content_client.post(
            "/api/content/testimonials",
            json={"text": "Lavoro eccellente e puntuale!", "rating": 5},
        )

    assert resp.status_code == 201, resp.text
    assert captured["name"] == "Mario Rossi"
    assert captured["location"] == ""


def test_get_approved_testimonials_includes_location(content_client):
    fake_doc = MagicMock()
    fake_doc.id = "t1"
    fake_doc.to_dict.return_value = {
        "name": "Sofia Bianchi",
        "location": "Roma",
        "text": "Ottima esperienza.",
        "rating": 5,
        "status": "approved",
    }

    fake_db = MagicMock()
    fake_db.collection.return_value.where.return_value.stream.return_value = [fake_doc]

    with patch(
        "src.api.routes.content_routes.get_firestore_client", return_value=fake_db
    ):
        resp = content_client.get("/api/content/testimonials")

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body[0]["location"] == "Roma"
