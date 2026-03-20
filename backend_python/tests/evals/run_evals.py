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
import asyncio
import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

# Ensure backend_python is on sys.path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / ".env")

from google.adk.evaluation import AgentEvaluator

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
logger = logging.getLogger("syd.evals")

EVALS_DIR = Path(__file__).parent
AGENT_MODULE = "src.adk.agents"


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
        "run_at": datetime.now(timezone.utc).isoformat(),
        "agent_module": AGENT_MODULE,
        "file_filter": file_filter or "all",
        "agent_name": agent_name or "root",
        "num_runs": num_runs,
    }


async def run_all(
    file_filter: str | None = None,
    agent_name: str | None = None,
    num_runs: int = 1,
    output_dir: Path | None = None,
) -> None:
    """Run ADK evaluation suite and optionally persist results as JSON."""
    if file_filter:
        target = EVALS_DIR / file_filter
        if not target.exists():
            logger.error(f"Test file not found: {target}")
            sys.exit(1)
        eval_path = str(target)
    else:
        eval_path = str(EVALS_DIR)

    logger.info(f"Running evals from: {eval_path}")
    logger.info(f"Agent module: {AGENT_MODULE}")
    if agent_name:
        logger.info(f"Sub-agent: {agent_name}")

    eval_result = await AgentEvaluator.evaluate(
        agent_module=AGENT_MODULE,
        eval_dataset_file_path_or_dir=eval_path,
        num_runs=num_runs,
        agent_name=agent_name,
        print_detailed_results=True,
    )

    logger.info("Evaluation complete.")

    # Persist results to JSON if output_dir is specified
    if output_dir is not None:
        meta = _build_run_meta(file_filter, agent_name, num_runs)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        suffix = f"_{file_filter.replace('.test.json', '')}" if file_filter else ""
        suffix += f"_{agent_name}" if agent_name else ""
        output_file = output_dir / f"eval_{timestamp}{suffix}.json"

        payload: dict = {"meta": meta, "results": None}
        if eval_result is not None:
            try:
                # ADK eval result may be a Pydantic model or plain dict
                if hasattr(eval_result, "model_dump"):
                    payload["results"] = eval_result.model_dump(mode="json")
                elif hasattr(eval_result, "__dict__"):
                    payload["results"] = vars(eval_result)
                else:
                    payload["results"] = eval_result
            except Exception as e:
                logger.warning(f"Could not serialize eval result: {e}")
                payload["results"] = str(eval_result)

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

    asyncio.run(run_all(
        file_filter=args.file,
        agent_name=args.agent,
        num_runs=args.runs,
        output_dir=output_dir,
    ))


if __name__ == "__main__":
    main()
