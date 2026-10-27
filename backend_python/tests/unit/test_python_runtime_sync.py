"""The CI tests the Python that production runs: the Cloud Run image.

uv runs `.python-version`, not the interpreter `setup-python` installs: with
`.python-version` at 3.12 the CI tested 3.12 for months while the image ran
3.14, and a PR moving the image to 3.15 looked green without a single test on 3.15.
"""
import os
import re
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2]
WORKFLOW = BACKEND.parent / ".github" / "workflows" / "backend-tests.yml"


def _image_python() -> str:
    match = re.search(r"^FROM python:(\d+\.\d+)", (BACKEND / "Dockerfile").read_text(encoding="utf-8"), re.M)
    assert match, "backend_python/Dockerfile no longer starts from an official python:X.Y image"
    return match.group(1)


def test_uv_runs_the_python_of_the_production_image():
    assert (BACKEND / ".python-version").read_text(encoding="utf-8").strip() == _image_python()


def test_the_ci_installs_the_python_of_the_production_image():
    versions = re.findall(r"python-version:\s*'([^']+)'", WORKFLOW.read_text(encoding="utf-8"))
    assert versions == [_image_python()]


@pytest.mark.skipif(not os.environ.get("CI"), reason="a developer may run the suite on another interpreter on purpose")
def test_the_ci_suite_runs_on_the_python_of_the_production_image():
    assert f"{sys.version_info.major}.{sys.version_info.minor}" == _image_python()
