"""
Session block as the agents' dynamic instruction (Phase 138 PR-5).

The prompts are `static_instruction` (the system instruction, identical for
every session: a stable prefix for Gemini's cache); the "CONTESTO SESSIONE"
block is `instruction`, which ADK then sends as the last instruction content,
right before the user's turn and never in the system instruction. These tests
build the model request with ADK's real request processors.
"""
import re
from types import SimpleNamespace

import pytest
from google.adk.agents.invocation_context import InvocationContext
from google.adk.agents.run_config import RunConfig  # pyright: ignore[reportPrivateImportUsage]
from google.adk.events import Event
from google.adk.flows.llm_flows.single_flow import SingleFlow
from google.adk.models.llm_request import LlmRequest
from google.adk.sessions import InMemorySessionService
from google.genai import types
from src.adk.agents import design_agent, quote_agent, syd_orchestrator, triage_agent
from src.adk.session_context import (
    ACTIVE_ROOM_STATE_KEY,
    ROOMS_STATE_KEY,
    room_index_entry,
    session_context_delta,
    session_context_instruction,
)
from src.prompts.components.security import SECURITY_GUARDRAILS_TAIL

AGENTS = [syd_orchestrator, triage_agent, design_agent, quote_agent]
USER_TEXT = "###\nfammi il render del bagno\n###"


def _state(is_guest: bool = False) -> dict:
    return {
        **session_context_delta(is_guest=is_guest, phone_on_file=True, session_id="proj-1"),
        ROOMS_STATE_KEY: [room_index_entry("r_bagno", "Bagno", "bagno", "5 mq, doccia walk-in")],
        ACTIVE_ROOM_STATE_KEY: "r_bagno",
    }


async def _model_request(agent, *, tool_continuation: bool = False, state: dict | None = None) -> LlmRequest:
    """The request ADK would send for `agent` on a turn of a session with `state`."""
    service = InMemorySessionService()
    session = await service.create_session(app_name="syd_orchestrator", user_id="u1", state=state or _state())
    user = types.Content(role="user", parts=[types.Part(text=USER_TEXT)])
    await service.append_event(session, Event(author="user", invocation_id="inv1", content=user))
    if tool_continuation:
        call = types.FunctionCall(id="c1", name="select_room", args={"name": "bagno"})
        await service.append_event(session, Event(
            author=agent.name, invocation_id="inv1",
            content=types.Content(role="model", parts=[types.Part(function_call=call)]),
        ))
        result = types.FunctionResponse(id="c1", name="select_room", response={"status": "success"})
        await service.append_event(session, Event(
            author=agent.name, invocation_id="inv1",
            content=types.Content(role="user", parts=[types.Part(function_response=result)]),
        ))
    ctx = InvocationContext(
        session_service=service, invocation_id="inv1", agent=agent, session=session, user_content=user,
        run_config=RunConfig(),
    )
    request = LlmRequest()
    async for _ in SingleFlow()._preprocess_async(ctx, request):
        pass
    return request


def _text(content: types.Content) -> str:
    return "".join(p.text or "" for p in content.parts or [])


@pytest.mark.parametrize("agent", AGENTS, ids=lambda a: a.name)
async def test_system_instruction_is_the_static_prompt_only(agent):
    request = await _model_request(agent)
    system = str(request.config.system_instruction)
    # The whole prompt, sandwich defense tail included (ADK appends its identity line after it).
    assert str(agent.static_instruction) in system and SECURITY_GUARDRAILS_TAIL.strip() in system
    # The prompts name the block; the block itself (header, session data) is not here.
    assert "## CONTESTO SESSIONE (dati di sistema" not in system and "proj-1" not in system


@pytest.mark.parametrize("agent", AGENTS, ids=lambda a: a.name)
async def test_session_block_is_the_last_instruction_before_the_user_turn(agent):
    contents = (await _model_request(agent)).contents
    assert _text(contents[-1]) == USER_TEXT
    block = _text(contents[-2])
    assert contents[-2].role == "user"
    assert "CONTESTO SESSIONE" in block and "SESSION_ID: proj-1" in block
    assert "STANZA ATTIVA: r_bagno · Bagno" in block


async def test_on_a_tool_continuation_the_block_follows_the_tool_result():
    contents = (await _model_request(syd_orchestrator, tool_continuation=True)).contents
    assert contents[-2].parts and contents[-2].parts[0].function_response is not None
    assert "CONTESTO SESSIONE" in _text(contents[-1])


@pytest.mark.parametrize(
    ("is_guest", "marker"), [(True, "OSPITE ANONIMO"), (False, "GIA' LOGGATO")]
)
def test_provider_reads_the_session_state(is_guest, marker):
    block = session_context_instruction(SimpleNamespace(state=_state(is_guest)))
    assert block.startswith("## CONTESTO SESSIONE") and marker in block
    assert "- r_bagno · Bagno · bagno · 5 mq, doccia walk-in" in block


def test_provider_without_session_context_is_empty():
    assert session_context_instruction(SimpleNamespace(state={})) == ""


@pytest.mark.parametrize("agent", AGENTS, ids=lambda a: a.name)
def test_static_prompts_have_no_state_placeholder(agent):
    """static_instruction is sent literally: a `{name}` would reach the model as is."""
    assert not re.search(r"\{[A-Za-z_][A-Za-z0-9_:.?]*\}", str(agent.static_instruction))
