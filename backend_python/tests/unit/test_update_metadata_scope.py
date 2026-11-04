"""POST /update-file-metadata: the Admin SDK bypasses storage.rules, so the
route must keep each caller inside the Storage folders of a project they own.

Before the fix, owning ANY project let a user patch the metadata of any file
under renders/, user-uploads/ or projects/ (other people's quote PDFs included).
"""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from google.api_core.exceptions import ServiceUnavailable
from google.cloud.storage import Bucket
from src.api.routes.update_metadata import router
from src.auth.jwt_handler import get_current_user_id
from src.core.exceptions import AppException

OWNER = "owner-uid"
PID = "proj123"


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.include_router(router)

    async def _uid() -> str:
        return OWNER

    @app.exception_handler(AppException)
    async def _app_exc(_req: Request, exc: AppException) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"error_code": exc.error_code, "message": exc.message})

    app.dependency_overrides[get_current_user_id] = _uid
    return TestClient(app)


def _db(owner_doc: dict | None) -> MagicMock:
    doc = MagicMock()
    doc.exists = owner_doc is not None
    doc.to_dict.return_value = owner_doc
    db = MagicMock()
    db.collection.return_value.document.return_value.get.return_value = doc
    return db


def _bucket(exists: bool = True, metadata: dict | None = None) -> tuple[MagicMock, MagicMock]:
    bucket = MagicMock(spec=Bucket)
    blob = MagicMock()
    blob.exists.return_value = exists
    blob.metadata = metadata
    bucket.blob.return_value = blob
    return bucket, blob


def _post(client: TestClient, db: MagicMock, bucket: MagicMock, **body):
    payload = {"project_id": PID, "file_path": f"renders/{PID}/a.png", "room": "cucina", **body}
    with patch("src.tools.project_storage.firestore.client", return_value=db), patch(
        "src.api.routes.update_metadata.get_storage_client", return_value=bucket
    ):
        return client.post("/update-file-metadata", json=payload)


@pytest.mark.parametrize(
    "path",
    [
        f"renders/{PID}/a.png",
        f"user-uploads/{PID}/photo.jpg",
        f"projects/{PID}/uploads/x.webp",
    ],
)
def test_owner_patches_a_file_of_their_project(client, path):
    bucket, blob = _bucket(metadata={"keep": "me", "room": "Bagno"})
    resp = _post(client, _db({"userId": OWNER}), bucket, file_path=path, status="approvato")

    assert resp.status_code == 200, resp.text
    bucket.blob.assert_called_once_with(path)
    assert blob.metadata == {"keep": "me", "room": "cucina", "status": "approvato"}
    blob.patch.assert_called_once()
    assert resp.json()["updated_metadata"] == {"room": "cucina", "status": "approvato"}


@pytest.mark.parametrize(
    "path",
    [
        "renders/other-project/a.png",            # another project's render
        "user-uploads/other-project/photo.jpg",   # another project's upload
        "projects/other-project/quotes/PRV_r1.pdf",  # another project's quote PDF
        f"projects/{PID}/quotes/PRV_r1.pdf",      # own quote PDF: not a gallery media
        f"projects/{PID}/a.png",                  # outside the dashboard uploads folder
        f"renders/{PID}x/a.png",                  # prefix of a longer id
        f"renders/{PID}",                         # the project folder itself is no file
        "renders/a.png",                          # no project folder at all
        f"documents/{PID}/a.pdf",                 # not an editable root
        f"users/{OWNER}/avatar.png",
    ],
)
def test_file_outside_the_project_is_refused_before_any_io(client, path):
    db = _db({"userId": OWNER})
    bucket, blob = _bucket()
    resp = _post(client, db, bucket, file_path=path)

    assert resp.status_code in (403, 422), resp.text
    db.collection.assert_not_called()
    bucket.blob.assert_not_called()
    blob.patch.assert_not_called()


@pytest.mark.parametrize(
    "path",
    [f"renders/{PID}/../other/a.png", f"renders/{PID}//a.png", f"/renders/{PID}/a.png", f"renders/{PID}/a b.png"],
)
def test_malformed_paths_are_rejected(client, path):
    bucket, blob = _bucket()
    resp = _post(client, _db({"userId": OWNER}), bucket, file_path=path)

    assert resp.status_code == 422, resp.text
    blob.patch.assert_not_called()


@pytest.mark.parametrize("field", [{"room": "Salotto di lusso"}, {"status": "qualsiasi"}, {"room": ""}])
def test_values_outside_the_picker_are_rejected(client, field):
    """Only the gallery picker's values: no free text reaches the blob metadata
    the agent later reads back through show_project_gallery."""
    bucket, blob = _bucket()
    resp = _post(client, _db({"userId": OWNER}), bucket, **field)

    assert resp.status_code == 422, resp.text
    blob.patch.assert_not_called()


def test_project_of_someone_else_is_refused(client):
    bucket, blob = _bucket()
    resp = _post(client, _db({"userId": "someone-else"}), bucket)

    assert resp.status_code == 403, resp.text
    bucket.blob.assert_not_called()


def test_legacy_owner_field_is_accepted(client):
    bucket, blob = _bucket()
    resp = _post(client, _db({"user_id": OWNER}), bucket)

    assert resp.status_code == 200, resp.text
    blob.patch.assert_called_once()


def test_missing_project_is_404(client):
    bucket, _ = _bucket()
    resp = _post(client, _db(None), bucket)

    assert resp.status_code == 404, resp.text
    bucket.blob.assert_not_called()


def test_missing_file_is_404(client):
    bucket, blob = _bucket(exists=False)
    resp = _post(client, _db({"userId": OWNER}), bucket)

    assert resp.status_code == 404, resp.text
    blob.patch.assert_not_called()


def test_empty_update_is_rejected(client):
    bucket, blob = _bucket()
    resp = _post(client, _db({"userId": OWNER}), bucket, room=None)

    assert resp.status_code == 422, resp.text
    blob.patch.assert_not_called()


def test_storage_failure_is_a_service_error(client):
    bucket, blob = _bucket()
    blob.patch.side_effect = ServiceUnavailable("down")
    resp = _post(client, _db({"userId": OWNER}), bucket)

    assert resp.status_code == 502, resp.text
    assert resp.json()["error_code"] == "SERVICE_ERROR"
