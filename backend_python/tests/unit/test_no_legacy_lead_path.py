"""The legacy lead path and the n8n tool are gone from the agent surface.

Quote requests go through suggest_quote_items -> list_ready_quotes ->
submit_quote_request, and the admin is notified by the transactional email
outbox (Phase 128). The old path — chat lead form -> "[LEAD_DATA_SUBMISSION]"
message -> trigger_n8n_webhook tool / POST /api/submit-lead — was unreachable
(no agent exposed display_lead_form) but still handed the model a tool that
could POST arbitrary payloads to an external system. These checks keep it out.
"""
from __future__ import annotations

import main
import pytest
from fastapi.testclient import TestClient
from main import app
from src.adk import agents

FORBIDDEN_PROMPT_MARKERS = ("n8n", "LEAD_DATA_SUBMISSION", "lead_submission", "display_lead_form")
ALL_AGENTS = (agents.syd_orchestrator, agents.triage_agent, agents.design_agent, agents.quote_agent)


def _tool_names(agent) -> set[str]:
    return {getattr(tool, "name", getattr(tool, "__name__", "")) for tool in agent.tools}


@pytest.mark.parametrize("agent", ALL_AGENTS, ids=lambda a: a.name)
def test_no_agent_exposes_n8n_or_lead_tools(agent) -> None:
    names = _tool_names(agent)
    assert not {n for n in names if "n8n" in n or "lead" in n}, names


def test_quote_agent_still_has_the_native_submission_tools() -> None:
    names = _tool_names(agents.quote_agent)
    assert {"suggest_quote_items", "list_ready_quotes", "submit_quote_request"} <= names


@pytest.mark.parametrize("agent", ALL_AGENTS, ids=lambda a: a.name)
def test_agent_prompts_do_not_reference_the_legacy_path(agent) -> None:
    instruction = agent.instruction if isinstance(agent.instruction, str) else ""
    hits = [m for m in FORBIDDEN_PROMPT_MARKERS if m.lower() in instruction.lower()]
    assert hits == [], f"{agent.name} prompt still references {hits}"


def test_submit_lead_endpoint_removed(monkeypatch: pytest.MonkeyPatch) -> None:
    assert "/api/submit-lead" not in app.openapi()["paths"]

    # App Check answers 403 BEFORE routing, which would prove nothing about the
    # route: let it pass so the request reaches the router.
    async def app_check_ok(_request) -> None:
        return None

    monkeypatch.setattr(main, "validate_app_check_token", app_check_ok)
    response = TestClient(app).post("/api/submit-lead", json={})

    assert response.status_code in {404, 405}
