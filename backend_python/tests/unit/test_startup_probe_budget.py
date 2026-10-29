"""The startup probe waits long enough for a healthy instance that starts slowly.

Cloud Run counts the probe from the container start, so its budget pays the
imports before the app runs as well as the warm-up. On 29 Oct the imports took
77 s on syd-brain-00696 (9-13 s on the same image before and after): the
warm-up was still running when the 90 s probe ran out and a healthy revision
was rejected. Cloud Run allows at most 240 s.
"""
import re
from pathlib import Path

from src.core.config import Settings

DEPLOY_CONFIG = Path(__file__).resolve().parents[2] / "deploy" / "cloud-run-config.sh"

# Longest import phase seen in production (syd-brain-00696, 29 Oct 2026).
SLOWEST_IMPORTS_SECONDS = 77
# Warm-up, worst case: the parallel steps, then firestore_async, then price_book.
SEQUENTIAL_WARMUP_STEPS = 3
CLOUD_RUN_MAX_STARTUP_PROBE_SECONDS = 240


def _probe_budget_seconds() -> int:
    probe = re.search(r"--startup-probe=([^\"\s]+)", DEPLOY_CONFIG.read_text(encoding="utf-8"))
    assert probe, "deploy/cloud-run-config.sh no longer sets --startup-probe"
    options = dict(option.split("=", 1) for option in probe.group(1).split(","))
    return int(options["periodSeconds"]) * int(options["failureThreshold"])


def test_the_probe_outlasts_slow_imports_and_the_slowest_warm_up():
    worst_warm_up = SEQUENTIAL_WARMUP_STEPS * Settings().WARMUP_STEP_TIMEOUT_SECONDS
    assert _probe_budget_seconds() >= SLOWEST_IMPORTS_SECONDS + worst_warm_up


def test_the_probe_stays_within_what_cloud_run_allows():
    assert _probe_budget_seconds() <= CLOUD_RUN_MAX_STARTUP_PROBE_SECONDS
