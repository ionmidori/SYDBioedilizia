"""
Standalone ADK evaluation runner for SYD Bioedilizia.

Usage:
    # Run all eval sets
    uv run python tests/evals/run_evals.py

    # Run a specific test file
    uv run python tests/evals/run_evals.py --file quote_flow.test.json

    # Run with custom agent name (sub-agent)
    uv run python tests/evals/run_evals.py --agent quote

Requires: GOOGLE_API_KEY or GEMINI_API_KEY in .env (calls live Gemini API).
"""
import asyncio
import argparse
import logging
import sys
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


async def run_all(
    file_filter: str | None = None,
    agent_name: str | None = None,
    num_runs: int = 1,
) -> None:
    """Run ADK evaluation suite."""
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

    await AgentEvaluator.evaluate(
        agent_module=AGENT_MODULE,
        eval_dataset_file_path_or_dir=eval_path,
        num_runs=num_runs,
        agent_name=agent_name,
        print_detailed_results=True,
    )

    logger.info("Evaluation complete.")


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
    args = parser.parse_args()

    asyncio.run(run_all(
        file_filter=args.file,
        agent_name=args.agent,
        num_runs=args.runs,
    ))


if __name__ == "__main__":
    main()
