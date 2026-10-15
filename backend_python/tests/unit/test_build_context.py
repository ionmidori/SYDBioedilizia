"""Guard the Cloud Run build context.

Two ignore files decide what leaves the machine on a deploy:

* ``.gcloudignore`` — what ``gcloud run deploy --source`` uploads to the
  ``*_cloudbuild`` bucket (the tarball is stored there, not just built). It
  follows ``.gitignore`` rules: a pattern without a leading ``/`` matches at any
  depth, so an unanchored ``data/`` would also drop ``src/data/``.
* ``.dockerignore`` — what ``COPY . .`` puts in the image. Patterns are relative
  to the context root, so ``data/`` only matches the root directory.

The tests evaluate both files with real gitignore matching (a throw-away git
repo whose ``.gitignore`` is the file under test; ``.dockerignore`` patterns are
root-anchored first to reproduce Docker's semantics) instead of comparing
strings, so equivalent spellings pass and broad patterns that would drop runtime
files fail. They also check that every file in ``src/data`` is versioned: the
repo-wide ``*.json`` ignore can hide a data file that exists on a developer
machine but not in a clean checkout (it already did once), and the code that
reads it may silently fall back.
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[2]
SRC_DATA = BACKEND_ROOT / "src" / "data"

pytestmark = pytest.mark.skipif(shutil.which("git") is None, reason="git is required to evaluate ignore files")

# Must never reach Cloud Build nor the runtime image.
MUST_EXCLUDE = (
    ".env",
    ".env.production",
    "firebase-service-account.json",
    "keys/firebase-service-account.json",
    "private.pem",
    "tests/unit/test_x.py",
    "tests_manual/test_perplexity.py",
    "scripts/ops/debug_users.py",
    "data/prezzario_lazio_2023_structured.json",
    "docs/architecture.md",
    "README.md",
    "debug_quotas.py",
    "dev.ps1",
    "deploy_local.sh",
    ".venv/lib/site.py",
    "src/__pycache__/main.cpython-312.pyc",
)

# Must be shipped: the app breaks (or silently degrades) without them.
MUST_SHIP = (
    "main.py",
    "pyproject.toml",
    "uv.lock",
    "Dockerfile",
    "entrypoint.sh",
    "src/core/config.py",
    "src/data/master_price_book.json",
    "src/data/renovation_assemblies.json",
    "src/prompts/components/modes.py",
    # Nested names that only a root-anchored pattern may exclude.
    "src/api/routes/test_router.py",
    "src/pkg/data/rules.json",
    "src/knowledge/NOTES.md",
)

IGNORE_FILES = (".gcloudignore", ".dockerignore")


def _as_gitignore(filename: str) -> str:
    text = (BACKEND_ROOT / filename).read_text(encoding="utf-8")
    if filename == ".gcloudignore":
        return text
    # Docker matches patterns from the context root only; make that explicit.
    lines = []
    for raw in text.splitlines():
        line = raw.strip()
        negated = line.startswith("!")
        body = line[1:] if negated else line
        if body and not body.startswith(("#", "/", "**/")):
            body = "/" + body
        lines.append(("!" if negated else "") + body if line and not line.startswith("#") else line)
    return "\n".join(lines) + "\n"


def _ignored(repo: Path, path: str) -> bool:
    result = subprocess.run(
        ["git", "check-ignore", "-q", "--no-index", path],
        cwd=repo,
        capture_output=True,
        check=False,
    )
    assert result.returncode in (0, 1), result.stderr.decode()
    return result.returncode == 0


@pytest.fixture(params=IGNORE_FILES)
def repo(request: pytest.FixtureRequest, tmp_path: Path) -> Path:
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    (tmp_path / ".gitignore").write_text(_as_gitignore(request.param), encoding="utf-8")
    return tmp_path


@pytest.mark.parametrize("path", MUST_EXCLUDE)
def test_excluded_from_the_build_context(repo: Path, path: str) -> None:
    assert _ignored(repo, path), f"{path} must not reach Cloud Build or the image"


@pytest.mark.parametrize("path", MUST_SHIP)
def test_runtime_files_are_shipped(repo: Path, path: str) -> None:
    assert not _ignored(repo, path), f"{path} is read at runtime and must be shipped"


def _tracked(path: Path) -> bool:
    result = subprocess.run(
        ["git", "ls-files", "--error-unmatch", str(path)],
        cwd=BACKEND_ROOT,
        capture_output=True,
        check=False,
    )
    return result.returncode == 0


def test_runtime_data_is_versioned() -> None:
    """A file that only exists on a developer machine is not in a clean build."""
    probe = subprocess.run(["git", "rev-parse", "--git-dir"], cwd=BACKEND_ROOT, capture_output=True, check=False)
    if probe.returncode != 0:
        pytest.skip("not a git checkout")

    untracked = [p.name for p in sorted(SRC_DATA.iterdir()) if p.is_file() and not _tracked(p)]
    assert untracked == [], f"src/data files not tracked by git (hidden by .gitignore?): {untracked}"

