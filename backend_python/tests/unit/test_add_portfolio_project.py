"""scripts/add_portfolio_project.py: the manifest is validated with the admin API
model before any upload, the image URL is only ever one of our portfolio folder,
and the same project is not added twice."""
import importlib.util
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from src.schemas.admin_content import PORTFOLIO_CATEGORIES, PortfolioProject
from src.services.admin_content import InvalidPortfolioImageError

_SPEC = importlib.util.spec_from_file_location(
    "add_portfolio_project", Path(__file__).resolve().parents[2] / "scripts" / "add_portfolio_project.py"
)
assert _SPEC and _SPEC.loader
script = importlib.util.module_from_spec(_SPEC)
# The script loads .env at import (for live runs): the test suite must not pick up
# the developer's real credentials, so loading is disabled while importing it.
with patch("dotenv.load_dotenv"):
    _SPEC.loader.exec_module(script)

BUCKET = "test-bucket.appspot.com"
MANIFEST = {"title": " Bagno in terracotta ", "category": "Bagno", "location": "Roma", "description": "Doccia."}


@pytest.fixture(autouse=True)
def _bucket(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(script.svc, "bucket_name", lambda: BUCKET)


def _project(title: str, location: str) -> PortfolioProject:
    return PortfolioProject(id="p1", title=title, category="Bagno", location=location)


def test_manifest_is_validated_like_the_admin_api():
    project = script.parse_manifest(MANIFEST)
    assert project.title == "Bagno in terracotta"  # stripped, as the API does
    assert project.active is True
    assert project.stats.area == ""


@pytest.mark.parametrize(
    "bad",
    [
        {**MANIFEST, "category": "Garage"},  # not one of the gallery categories
        {**MANIFEST, "title": "   "},
        {**MANIFEST, "colour": "red"},  # unknown fields are refused, not ignored
        {**MANIFEST, "image_url": "https://evil.example/x.webp"},  # set by the script only
        ["not", "an", "object"],
    ],
)
def test_bad_manifest_is_refused_before_any_upload(bad: object):
    with pytest.raises(script.ManifestError):
        script.parse_manifest(bad)


def test_payload_takes_only_an_image_of_our_portfolio_folder():
    project = script.parse_manifest(MANIFEST)
    url = f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}/o/portfolio%2F1_ab.webp?alt=media"
    assert script.with_image(project, url)["image_url"] == url
    with pytest.raises(InvalidPortfolioImageError):
        script.with_image(project, "https://firebasestorage.googleapis.com/v0/b/other/o/portfolio%2F1.webp")


def test_duplicate_matches_title_and_location_ignoring_case_and_spaces():
    existing = [_project("Bagno  in Terracotta", "roma")]
    assert script.find_duplicate(existing, "bagno in terracotta", "Roma") is existing[0]
    assert script.find_duplicate(existing, "bagno in terracotta", "Fiumicino") is None


def test_categories_have_a_single_definition():
    """The request models accept exactly the public tuple (no second list to keep in sync)."""
    for category in PORTFOLIO_CATEGORIES:
        assert script.parse_manifest({**MANIFEST, "category": category}).category == category


PNG = bytes.fromhex("89504E470D0A1A0A") + b"\x00" * 16


def test_photo_uses_the_admin_upload_allowlist():
    assert script.check_photo(bytes.fromhex("FFD8FFE1") + b"\x00" * 16) == "image/jpeg"
    assert script.check_photo(PNG) == "image/png"
    for bad in (b"II*\x00" + b"\x00" * 16, b"BM" + b"\x00" * 20, b"RIFF0000WAVE" + b"\x00" * 8):  # TIFF, BMP, WAV
        with pytest.raises(script.PhotoError):
            script.check_photo(bad)


def test_photo_over_the_size_limit_is_refused(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(script.portfolio_images, "MAX_UPLOAD_BYTES", 10)
    with pytest.raises(script.PhotoError, match="larger"):
        script.check_photo(PNG)


@pytest.fixture
def publish_mocks(monkeypatch: pytest.MonkeyPatch) -> dict[str, AsyncMock]:
    mocks = {
        "create": AsyncMock(return_value=_project("Bagno", "Roma")),
        "delete": AsyncMock(),
        "audit": AsyncMock(),
    }
    monkeypatch.setattr(script.portfolio_images, "upload_sync", lambda *_: None)
    monkeypatch.setattr(script, "get_async_firestore_client", lambda: object())
    monkeypatch.setattr(script.svc, "create_project", mocks["create"])
    monkeypatch.setattr(script.svc, "delete_image_quietly", mocks["delete"])
    monkeypatch.setattr(script, "write_audit_event", mocks["audit"])
    return mocks


async def test_publish_audits_only_after_the_project_exists(publish_mocks: dict[str, AsyncMock]):
    await script._publish(script.parse_manifest(MANIFEST), b"webp", "cli")

    actions = [c.args[0] for c in publish_mocks["audit"].await_args_list]
    assert actions == [script.AuditAction.PORTFOLIO_UPLOAD, script.AuditAction.PORTFOLIO_CREATE]
    publish_mocks["delete"].assert_not_awaited()


async def test_failed_create_removes_the_uploaded_photo(publish_mocks: dict[str, AsyncMock]):
    publish_mocks["create"].side_effect = RuntimeError("firestore down")

    with pytest.raises(RuntimeError):
        await script._publish(script.parse_manifest(MANIFEST), b"webp", "cli")

    publish_mocks["delete"].assert_awaited_once()
    publish_mocks["audit"].assert_not_awaited()
