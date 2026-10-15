"""Guard the Cloud Run build context.

Two ignore files decide what leaves the machine on a deploy:

* ``.gcloudignore`` — what ``gcloud run deploy --source`` uploads to the
  ``*_cloudbuild`` bucket (the tarball is stored there, not just built).
  It follows ``.gitignore`` rules: an unanchored ``data/`` matches at any
  depth, so it would also drop ``src/data/``.
* ``.dockerignore`` — what ``COPY . .`` puts in the image. Patterns are
  relative to the context root, so ``data/`` only matches the root directory.

Local QA tooling writes secrets to disk (TestSprite ``tmp/config.json`` held an
API key) and ``data/`` carries megabytes of offline ingestion files. Both must
stay out of the tarball and the image, while ``src/data/`` (price book seed,
assemblies, aggregation rules) must stay in. This test fails if either file
drifts from that contract.
"""
from __future__ import annotations

from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[2]

# Root-level directories that must never reach Cloud Build nor the image.
ROOT_DIRS = ("tests/", "tests_manual/", "testsprite_tests/", "scripts/", "data/", "docs/")
# Patterns that are meant to match at any depth.
ANYWHERE = (".env", ".env.*", ".venv/", "**/tmp/")

# Files read at runtime from src/ — must survive both ignore files.
RUNTIME_DATA = (
    "src/data/master_price_book.json",
    "src/data/renovation_assemblies.json",
    "src/data/aggregation_rules.json",
)


def _patterns(filename: str) -> set[str]:
    lines = (BACKEND_ROOT / filename).read_text(encoding="utf-8").splitlines()
    return {line.strip() for line in lines if line.strip() and not line.lstrip().startswith("#")}


@pytest.mark.parametrize("pattern", ANYWHERE)
@pytest.mark.parametrize("filename", [".gcloudignore", ".dockerignore"])
def test_excludes_secrets_and_tool_output(filename: str, pattern: str) -> None:
    assert pattern in _patterns(filename), f"{filename} must exclude {pattern!r}"


@pytest.mark.parametrize("directory", ROOT_DIRS)
def test_gcloudignore_excludes_root_dir_anchored(directory: str) -> None:
    patterns = _patterns(".gcloudignore")
    assert f"/{directory}" in patterns, f".gcloudignore must exclude /{directory}"
    # Unanchored form would also match nested dirs such as src/data/.
    assert directory not in patterns, f".gcloudignore must anchor {directory!r} with a leading '/'"


@pytest.mark.parametrize("directory", ROOT_DIRS)
def test_dockerignore_excludes_root_dir(directory: str) -> None:
    assert directory in _patterns(".dockerignore"), f".dockerignore must exclude {directory!r}"


@pytest.mark.parametrize("relpath", RUNTIME_DATA)
def test_runtime_data_is_shipped(relpath: str) -> None:
    assert (BACKEND_ROOT / relpath).is_file(), f"{relpath} is read at runtime and must exist"
    for filename in (".gcloudignore", ".dockerignore"):
        patterns = _patterns(filename)
        assert "src/" not in patterns and "/src/" not in patterns
        assert "src/data/" not in patterns and "/src/data/" not in patterns
