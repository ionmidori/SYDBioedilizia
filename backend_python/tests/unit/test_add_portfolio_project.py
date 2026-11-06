"""scripts/add_portfolio_project.py: the manifest is validated with the admin API
model before any upload, the image URL is only ever one of our portfolio folder,
and the same project is not added twice."""
import importlib.util
from pathlib import Path

import pytest
from src.schemas.admin_content import PORTFOLIO_CATEGORIES, PortfolioProject
from src.services.admin_content import InvalidPortfolioImageError

_SPEC = importlib.util.spec_from_file_location(
    "add_portfolio_project", Path(__file__).resolve().parents[2] / "scripts" / "add_portfolio_project.py"
)
assert _SPEC and _SPEC.loader
script = importlib.util.module_from_spec(_SPEC)
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
