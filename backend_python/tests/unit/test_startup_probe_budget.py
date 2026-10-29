"""The startup probe waits long enough for a healthy instance that starts slowly.

Cloud Run counts the probe from the container start, so its budget pays the
imports before the app runs as well as the warm-up. On 29 Oct the imports took
77 s on syd-brain-00696 (9-13 s on the same image before and after): the
warm-up was still running when the 90 s probe ran out and a healthy revision
was rejected. Cloud Run allows at most 240 s (initial delay included).
"""
import ast
import re
from pathlib import Path

from src.core.config import Settings

BACKEND = Path(__file__).resolve().parents[2]
DEPLOY_CONFIG = BACKEND / "deploy" / "cloud-run-config.sh"
MAIN = BACKEND / "main.py"

# Longest import phase seen in production (syd-brain-00696, 29 Oct 2026).
SLOWEST_IMPORTS_SECONDS = 77
CLOUD_RUN_MAX_STARTUP_PROBE_SECONDS = 240


def _probe_options() -> dict[str, str]:
    # The argument itself (quoted in `cmd=(...)`), not a mention in the comments.
    probe = re.search(r'"--startup-probe=([^"]+)"', DEPLOY_CONFIG.read_text(encoding="utf-8"))
    assert probe, "deploy/cloud-run-config.sh no longer sets --startup-probe"
    options = dict(option.split("=", 1) for option in probe.group(1).split(","))
    assert {"periodSeconds", "failureThreshold"} <= options.keys(), f"probe without a budget: {options}"
    return options


def _probe_budget_seconds() -> int:
    options = _probe_options()
    return int(options.get("initialDelaySeconds", "0")) + int(options["periodSeconds"]) * int(
        options["failureThreshold"]
    )


def _warmup_rounds() -> int:
    """Time limits paid in a row: the parallel steps once, then each sequential step."""
    calls = [
        node
        for node in ast.walk(ast.parse(MAIN.read_text(encoding="utf-8")))
        if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "run_warmup"
    ]
    assert len(calls) == 1, "main.py should start the warm-up with one run_warmup call"
    sequential = next((kw.value for kw in calls[0].keywords if kw.arg == "sequential"), None)
    assert isinstance(sequential, ast.List), "run_warmup(sequential=[...]) is no longer a list literal"
    return 1 + len(sequential.elts)


def test_the_probe_outlasts_slow_imports_and_the_slowest_warm_up():
    # The code default, not this machine's .env: production does not override it.
    step_timeout = Settings.model_fields["WARMUP_STEP_TIMEOUT_SECONDS"].default
    worst_warm_up = _warmup_rounds() * step_timeout
    assert _probe_budget_seconds() >= SLOWEST_IMPORTS_SECONDS + worst_warm_up


def test_the_probe_stays_within_what_cloud_run_allows():
    assert _probe_budget_seconds() <= CLOUD_RUN_MAX_STARTUP_PROBE_SECONDS
