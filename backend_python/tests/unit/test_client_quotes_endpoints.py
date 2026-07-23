"""
Client area "Preventivi" endpoints — PR client-quotes-section.

- GET /quote/user/{uid}: project_name + pdf_available; grand_total MASKED for
  non-admin callers unless the quote is approved (draft confidentiality).
- GET /quote/{id}/pdf: uses the stored pdf_blob_path (fix: the legacy fixed
  path projects/{id}/quote.pdf was never written by the pipeline) and is
  gated to approved quotes for non-admin callers.
"""
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from src.api.routes.quote_routes import router
from src.auth.jwt_handler import verify_token
from src.schemas.internal import UserSession

OWNER_UID = "client-uid-123"


def _make_client(role: str | None = None, uid: str = OWNER_UID) -> TestClient:
    app = FastAPI()
    app.include_router(router)

    async def override_verify_token():
        claims = {"role": role} if role else {}
        return UserSession(uid=uid, email="u@test.com", claims=claims)

    app.dependency_overrides[verify_token] = override_verify_token
    return TestClient(app)


def _quote_doc(status_: str, grand_total: float = 1000.0, blob_path: str | None = None):
    doc = MagicMock()
    doc.exists = True
    data = {
        "status": status_,
        "financials": {"grand_total": grand_total},
        "items": [{"x": 1}, {"x": 2}],
        "updated_at": "2026-07-23T10:00:00",
    }
    if blob_path:
        data["pdf_blob_path"] = blob_path
    doc.to_dict.return_value = data
    return doc


def _project_doc(pid: str, quote_doc) -> MagicMock:
    proj = MagicMock()
    proj.id = pid
    proj.to_dict.return_value = {"userId": OWNER_UID, "name": f"Progetto {pid}"}
    proj.reference.collection.return_value.document.return_value.get = AsyncMock(
        return_value=quote_doc
    )
    return proj


class TestListUserQuotes:
    def _db_with(self, project_docs):
        db = MagicMock()
        query = MagicMock()
        query.get = AsyncMock(return_value=project_docs)
        db.collection.return_value.where.return_value = query
        return db

    def test_non_admin_sees_masked_total_for_pending_quote(self):
        db = self._db_with([_project_doc("p1", _quote_doc("pending_review"))])
        with patch("src.api.routes.quote_routes.get_async_firestore_client", return_value=db):
            resp = _make_client().get(f"/api/quote/user/{OWNER_UID}")

        assert resp.status_code == 200
        [row] = resp.json()
        assert row["status"] == "pending_review"
        assert row["grand_total"] == 0.0  # confidential until approval
        assert row["project_name"] == "Progetto p1"
        assert row["pdf_available"] is False

    def test_non_admin_sees_total_and_pdf_for_approved_quote(self):
        quote = _quote_doc("approved", blob_path="projects/p1/quotes/quote_1.pdf")
        db = self._db_with([_project_doc("p1", quote)])
        with patch("src.api.routes.quote_routes.get_async_firestore_client", return_value=db):
            resp = _make_client().get(f"/api/quote/user/{OWNER_UID}")

        [row] = resp.json()
        assert row["grand_total"] == 1000.0
        assert row["pdf_available"] is True

    def test_admin_sees_unmasked_totals(self):
        db = self._db_with([_project_doc("p1", _quote_doc("draft"))])
        with patch("src.api.routes.quote_routes.get_async_firestore_client", return_value=db):
            resp = _make_client(role="admin", uid="admin-uid").get(f"/api/quote/user/{OWNER_UID}")

        [row] = resp.json()
        assert row["grand_total"] == 1000.0


class TestQuotePdfUrl:
    def _patches(self, quote_doc, blob_exists: bool = True):
        quote_ref = MagicMock()
        quote_ref.get = AsyncMock(return_value=quote_doc)

        blob = MagicMock()
        blob.exists.return_value = blob_exists
        blob.generate_signed_url.return_value = "https://fresh.example/q.pdf"
        bucket = MagicMock()
        bucket.blob.return_value = blob

        ownership = patch(
            "src.api.routes.quote_routes._verify_project_ownership", new=AsyncMock()
        )
        return quote_ref, bucket, blob, ownership

    def test_non_admin_gets_404_for_non_approved_quote(self):
        quote_ref, bucket, _, ownership = self._patches(_quote_doc("pending_review"))
        with (
            ownership,
            patch("src.api.routes.quote_routes._quote_doc_ref", return_value=quote_ref),
        ):
            resp = _make_client().get("/api/quote/p1/pdf")
        assert resp.status_code == 404

    def test_approved_quote_uses_stored_blob_path(self):
        quote_ref, bucket, blob, ownership = self._patches(
            _quote_doc("approved", blob_path="projects/p1/quotes/quote_99.pdf")
        )
        with (
            ownership,
            patch("src.api.routes.quote_routes._quote_doc_ref", return_value=quote_ref),
            patch("firebase_admin.storage.bucket", return_value=bucket),
        ):
            resp = _make_client().get("/api/quote/p1/pdf")

        assert resp.status_code == 200
        assert resp.json()["pdf_url"] == "https://fresh.example/q.pdf"
        bucket.blob.assert_called_once_with("projects/p1/quotes/quote_99.pdf")

    def test_missing_blob_returns_404(self):
        quote_ref, bucket, _, ownership = self._patches(
            _quote_doc("approved", blob_path="projects/p1/quotes/quote_99.pdf"),
            blob_exists=False,
        )
        with (
            ownership,
            patch("src.api.routes.quote_routes._quote_doc_ref", return_value=quote_ref),
            patch("firebase_admin.storage.bucket", return_value=bucket),
        ):
            resp = _make_client().get("/api/quote/p1/pdf")
        assert resp.status_code == 404
