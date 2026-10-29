"""
Standalone ADK evaluation runner for SYD Bioedilizia.

Usage:
    # Run all eval sets
    uv run python tests/evals/run_evals.py

    # Run a specific test file
    uv run python tests/evals/run_evals.py --file quote_flow.test.json

    # Run with custom agent name (sub-agent)
    uv run python tests/evals/run_evals.py --agent quote

    # Run with 3 iterations per case and save results to JSON
    uv run python tests/evals/run_evals.py --runs 3 --output results/

Requires: GOOGLE_API_KEY or GEMINI_API_KEY in .env (calls live Gemini API).
"""
import argparse
import asyncio
import json
import logging
import sys
from datetime import UTC, datetime
from pathlib import Path

# Ensure backend_python is on sys.path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent.parent / ".env")

from google.adk.evaluation import AgentEvaluator
from tests.evals.multi_room.fakes import BACKEND_CHECKS, multi_room_backend

# AgentEvaluator prints the agents' replies (emoji included): on a Windows
# console (cp1252) that print would raise UnicodeEncodeError mid-run.
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
logger = logging.getLogger("syd.evals")

EVALS_DIR = Path(__file__).parent
AGENT_MODULE = "src.adk.agents"
# Multi-room chat (Phase 138): own agent module (the production App, src/adk/app_factory.py)
# and an in-memory backend that records renders, quotes, submissions and replies.
MULTI_ROOM_DIR = EVALS_DIR / "multi_room"
MULTI_ROOM_AGENT_MODULE = "tests.evals.multi_room.agent"


def _resolve_output_dir(output_arg: str | None) -> Path | None:
    """Resolve and create the output directory for eval results."""
    if not output_arg:
        return None
    output_dir = EVALS_DIR / output_arg if not Path(output_arg).is_absolute() else Path(output_arg)
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def _build_run_meta(
    file_filter: str | None,
    agent_name: str | None,
    num_runs: int,
) -> dict:
    """Build metadata dict for this eval run."""
    return {
        "run_at": datetime.now(UTC).isoformat(),
        "agent_module": AGENT_MODULE,
        "file_filter": file_filter or "all",
        "agent_name": agent_name or "root",
        "num_runs": num_runs,
    }


def _serialize(eval_result: object) -> object:
    """ADK eval result as JSON data (Pydantic model, plain object or None)."""
    if eval_result is None:
        return None
    try:
        if hasattr(eval_result, "model_dump"):
            return eval_result.model_dump(mode="json")  # pyright: ignore[reportAttributeAccessIssue]
        if hasattr(eval_result, "__dict__"):
            return vars(eval_result)
        return eval_result
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Could not serialize eval result: {e}")
        return str(eval_result)


def _eval_targets(file_filter: str | None) -> list[Path]:
    """Eval set files to run: one, or every set (top-level and multi_room/)."""
    if file_filter:
        target = EVALS_DIR / file_filter
        if not target.exists():
            logger.error(f"Test file not found: {target}")
            sys.exit(1)
        return sorted(target.glob("*.test.json")) if target.is_dir() else [target]
    return sorted(EVALS_DIR.glob("*.test.json")) + sorted(MULTI_ROOM_DIR.glob("*.test.json"))


async def _evaluate(path: Path, agent_name: str | None, num_runs: int) -> object:
    """Run one eval set. Raises on a schema error, an API failure or a metric
    below threshold. The multi-room sets run against an in-memory backend and
    also fail on its check: a render that did not start from the bathroom
    photo, a quote without a correct section per room, a submission without
    the client's explicit yes, a guest asked to log in before (or more than
    once at) its confirmation."""
    common = {
        "eval_dataset_file_path_or_dir": str(path),
        "num_runs": num_runs,
        "agent_name": agent_name,
        "print_detailed_results": True,
    }
    if path.parent != MULTI_ROOM_DIR:
        return await AgentEvaluator.evaluate(agent_module=AGENT_MODULE, **common)
    with multi_room_backend(path.name) as run:
        result = await AgentEvaluator.evaluate(agent_module=MULTI_ROOM_AGENT_MODULE, **common)
    for line in run.responses.token_report():
        logger.info(f"{path.name} tokens {line}")
    for line in run.tool_calls.report():
        logger.info(f"{path.name} tools {line}")
    problems = BACKEND_CHECKS[path.name](run)
    if problems:
        raise AssertionError(f"{path.name}: " + "; ".join(problems))
    logger.info(
        f"{path.name}: backend check passed (renders {len(run.renders.sources)}, quotes {len(run.quotes.quotes)}, "
        f"submissions {len(run.submissions.after_quotes)})"
    )
    return result


async def run_all(
    file_filter: str | None = None,
    agent_name: str | None = None,
    num_runs: int = 1,
    output_dir: Path | None = None,
) -> None:
    """Run ADK evaluation suite and optionally persist results as JSON."""
    targets = _eval_targets(file_filter)
    logger.info(f"Running evals: {', '.join(str(t.relative_to(EVALS_DIR)) for t in targets)}")
    if agent_name:
        logger.info(f"Sub-agent: {agent_name}")

    # Any exception (bad schema, below-threshold metric) propagates to main(), which exits non-zero.
    results = {}
    for target in targets:
        results[str(target.relative_to(EVALS_DIR))] = await _evaluate(target, agent_name, num_runs)

    logger.info("Evaluation complete.")

    # Persist results to JSON if output_dir is specified
    if output_dir is not None:
        meta = _build_run_meta(file_filter, agent_name, num_runs)
        timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        suffix = f"_{Path(file_filter).name.replace('.test.json', '')}" if file_filter else ""
        suffix += f"_{agent_name}" if agent_name else ""
        output_file = output_dir / f"eval_{timestamp}{suffix}.json"

        payload = {"meta": meta, "results": {name: _serialize(r) for name, r in results.items()}}
        output_file.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        logger.info(f"Results saved to: {output_file}")


def main() -> None:
    parser = argparse.ArgumentParser(description="SYD ADK Evaluation Runner")
    parser.add_argument(
        "--file", "-f",
        help="Specific .test.json file to run (relative to tests/evals/)",
        default=None,
    )
    parser.add_argument(
        "--agent", "-a",
        help="Sub-agent name to evaluate (e.g., 'quote', 'triage', 'design')",
        default=None,
    )
    parser.add_argument(
        "--runs", "-n",
        type=int,
        default=1,
        help="Number of runs per eval case (default: 1)",
    )
    parser.add_argument(
        "--output", "-o",
        help="Directory to save JSON results (relative to tests/evals/, e.g. 'results/')",
        default=None,
    )
    args = parser.parse_args()

    output_dir = _resolve_output_dir(args.output)

    try:
        asyncio.run(run_all(
            file_filter=args.file,
            agent_name=args.agent,
            num_runs=args.runs,
            output_dir=output_dir,
        ))
    except Exception:  # noqa: BLE001 - CI must fail on any eval error (schema, threshold, API)
        logger.exception("Evaluation failed.")
        sys.exit(1)


if __name__ == "__main__":
    main()
