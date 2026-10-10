"""Guard: every google-genai `Content(...)` built in src/ declares its role.

Regression (10 Oct 2026, after the switch to Vertex AI): the Gemini Developer
API defaults a role-less Content to "user", Vertex AI rejects it with
`400 INVALID_ARGUMENT: Please use a valid role: user, model`. Quote analysis
(InsightEngine), room measurement, photo triage, renders and the vision
modules all failed in production while the ADK chat (which sets roles) kept
working. A source scan catches the next role-less Content before deploy.
"""
import ast
from pathlib import Path

SRC = Path(__file__).resolve().parents[2] / "src"


def _role_less_content_calls() -> list[str]:
    offenders: list[str] = []
    for path in sorted(SRC.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", None)
            if name == "Content" and not any(kw.arg == "role" for kw in node.keywords):
                offenders.append(f"{path.relative_to(SRC.parent)}:{node.lineno}")
    return offenders


def test_every_genai_content_declares_a_role():
    offenders = _role_less_content_calls()
    assert not offenders, (
        "genai Content(...) without role= (Vertex AI answers 400 'Please use a valid role'): "
        + ", ".join(offenders)
    )
