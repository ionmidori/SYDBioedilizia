"""
CI smoke test for the Streamlit admin console.

Uses Streamlit's AppTest (headless script execution, no live server, no
browser) to catch exactly the class of bug found in Phase 97: a NameError
deep in app.py's login-error branch, and a streamlit-authenticator API
mismatch (login() signature changed 0.2.x -> 0.4.x) that only surfaced
the first time this code path actually ran in production -- admin_tool
has no CI/CD and hadn't been redeployed in 4 months (see
PROJECT_CONTEXT_SUMMARY.md, Phase 97).

app.py itself only reads config.yaml and drives streamlit_authenticator
(no Firebase calls), so it's safe to run without any GCP credentials --
CI uses config.yaml.example as a stand-in (config.yaml is gitignored).

Each page has an early auth guard (`if not
st.session_state.get("authentication_status"): st.stop()`) BEFORE any
Firebase-touching code, so AppTest on an unauthenticated session only
exercises imports + page config + the guard itself -- it cannot reach
Firestore. This still catches import-time regressions (bad imports,
top-level NameError/AttributeError) even though it can't authenticate.
"""
import glob
import shutil
from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

_ROOT = Path(__file__).parent


@pytest.fixture(autouse=True, scope="session")
def _ci_config_yaml():
    """Provide a non-sensitive config.yaml for AppTest runs (gitignored in real deploys)."""
    target = _ROOT / "config.yaml"
    if target.exists():
        yield  # a real config.yaml is present (local dev run) -- don't touch it
        return
    example = _ROOT / "config.yaml.example"
    shutil.copy(example, target)
    try:
        yield
    finally:
        target.unlink(missing_ok=True)


def test_app_py_loads_without_exception():
    at = AppTest.from_file(str(_ROOT / "app.py"))
    at.run(timeout=15)
    assert not at.exception, (
        f"app.py raised an unhandled exception on a clean run: {at.exception}"
    )


@pytest.mark.parametrize(
    "page_path",
    sorted(glob.glob(str(_ROOT / "pages" / "*.py"))),
    ids=lambda p: Path(p).name,
)
def test_page_imports_without_exception(page_path):
    """Unauthenticated smoke: catches import/top-level errors before the
    auth guard's st.stop() (never reaches Firebase-dependent code)."""
    at = AppTest.from_file(page_path)
    at.run(timeout=15)
    assert not at.exception, (
        f"{Path(page_path).name} raised an unhandled exception on a clean run: {at.exception}"
    )
