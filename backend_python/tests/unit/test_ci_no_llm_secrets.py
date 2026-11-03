"""No workflow may hold a Gemini/Vertex key or run the ADK evals.

The unit suite mocks `genai.Client`, but conftest only forces a dummy key when
`GEMINI_API_KEY` is empty: with the key in the workflow env, a test that forgot
its mock would call Gemini on every pull request. The ADK evals (`npm run
eval:run*`) are the one thing that really calls the models, and they stay manual.
If a deliberate manual eval workflow is ever added, update this test with it.
"""
import re
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
WORKFLOWS = BACKEND.parent / ".github" / "workflows"

_LLM_REFERENCE = re.compile(r"GEMINI|GOOGLE_API_KEY|VERTEX|eval:run|run-evals", re.IGNORECASE)


def find_llm_references(text: str) -> list[tuple[int, str]]:
    """(line number, line) of every line that mentions an LLM key or an eval run."""
    return [(n, line.strip()) for n, line in enumerate(text.splitlines(), 1) if _LLM_REFERENCE.search(line)]


def test_the_workflows_exist():
    assert list(WORKFLOWS.glob("*.yml")), f"no workflows found in {WORKFLOWS}: the guard would pass on nothing"


def test_no_workflow_holds_a_gemini_key_or_runs_the_evals():
    found = {
        path.name: hits
        for path in sorted(WORKFLOWS.glob("*.yml"))
        if (hits := find_llm_references(path.read_text(encoding="utf-8")))
    }
    assert not found, f"workflows must not call Gemini/Vertex (evals are manual): {found}"


def test_the_scan_flags_a_gemini_secret():
    text = "        env:\n          GEMINI_API_KEY: '${{ secrets.GEMINI_API_KEY }}'\n"
    assert [n for n, _ in find_llm_references(text)] == [2]


def test_the_scan_flags_google_vertex_and_eval_runs():
    for line in ("GOOGLE_API_KEY: x", "GOOGLE_GENAI_USE_VERTEXAI: true", "run: npm run eval:run:quote", "run: node scripts/run-evals.mjs"):
        assert find_llm_references(line), line


def test_the_scan_ignores_ordinary_steps():
    assert find_llm_references("run: uv run pytest -m 'not integration'\nrun: npm run build\n") == []
