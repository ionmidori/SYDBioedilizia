"""`apply.sh` must survive Git Bash on Windows.

MSYS rewrites an argument that starts with `/` into a Windows path: `--path=/health`
became `/C:/Program Files/Git/health`, the uptime check got a 403 from every region and
the "Uptime /health" alert fired for nothing. Excluding `--path=` from the conversion has
to happen before the check is created.
"""
from pathlib import Path

APPLY = Path(__file__).resolve().parents[2] / "deploy" / "observability" / "apply.sh"
EXCLUDE = "export MSYS2_ARG_CONV_EXCL='--path='"
UPTIME_CREATE = "gcloud monitoring uptime create"


def test_the_script_exists():
    assert APPLY.is_file(), f"{APPLY} not found: the guard would pass on nothing"


def test_path_argument_is_excluded_from_msys_conversion_before_the_uptime_check_is_created():
    script = APPLY.read_text(encoding="utf-8")
    assert UPTIME_CREATE in script
    assert EXCLUDE in script, "Git Bash would turn --path=/health into a Windows path"
    assert script.index(EXCLUDE) < script.index(UPTIME_CREATE)
