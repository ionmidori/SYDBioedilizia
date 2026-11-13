"""
No logger call may print the id of a project, a session or an audited resource.

For a guest the project id is a token (whoever has it can read the project). Logs go to
Cloud Logging where many people can read them, and CodeQL flags them
(py/clear-text-logging-sensitive-data). Use `quote_number`, `room_id` or the request id
(added to every line by the formatter) to follow a request.
"""
from __future__ import annotations

import ast
from pathlib import Path

SRC = Path(__file__).resolve().parents[2] / "src"

_LEVELS = frozenset({"debug", "info", "warning", "error", "exception", "critical", "log"})
# Names, attributes and extra keys that hold a project, session or audit-resource id.
_ID_NAMES = frozenset({"session_id", "project_id", "resource_id", "pid"})


def _is_logger_call(node: ast.Call) -> bool:
    func = node.func
    if not (isinstance(func, ast.Attribute) and func.attr in _LEVELS):
        return False
    owner = func.value
    return isinstance(owner, ast.Name) and (owner.id == "log" or owner.id.lstrip("_").endswith("logger"))


def _id_names_in(call: ast.Call) -> list[str]:
    found: list[str] = []
    for node in ast.walk(call):
        if isinstance(node, ast.Name) and node.id in _ID_NAMES:
            found.append(node.id)
        elif isinstance(node, ast.Attribute):
            if node.attr in _ID_NAMES:
                found.append(node.attr)
        elif isinstance(node, ast.Constant) and isinstance(node.value, str) and node.value in _ID_NAMES:
            found.append(node.value)
    return found


def _offences() -> list[str]:
    offences: list[str] = []
    for path in sorted(SRC.rglob("*.py")):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Call) and _is_logger_call(node):
                if names := _id_names_in(node):
                    offences.append(f"{path.relative_to(SRC.parent)}:{node.lineno} -> {', '.join(sorted(set(names)))}")
    return offences


def test_no_logger_call_prints_an_id() -> None:
    offences = _offences()
    assert not offences, "log lines with an id (use quote_number, room_id or nothing):\n" + "\n".join(offences)


def test_guard_sees_an_id_in_a_log_call() -> None:
    """The guard itself: an f-string, an extra key and a `.get('resource_id')` are all caught."""
    source = (
        "logger.info(f'x {session_id}')\n"
        "logger.warning('x', extra={'project_id': 1})\n"
        "logger.error('x %s', record.get('resource_id'))\n"
        "logger.info('ok', extra={'room_id': 1})\n"
    )
    calls = [n for n in ast.walk(ast.parse(source)) if isinstance(n, ast.Call) and _is_logger_call(n)]
    assert [bool(_id_names_in(c)) for c in calls] == [True, True, True, False]
