"""
The step of the quote as a control (strada B, PR 2; flow of 27 Nov, PR A): the
`quote` agent reads the step in its session block, and a tool called out of
step is not run.

Blocked only where the step reader is reliable and the error costs: a guest's
registration (the login first), the login before the collection is complete,
a second registration in one turn. The send is not the agent's: only the
"Invia al team" button of the card sends (U1). The refused call does not count
as called (the next model call and the next turn read the same step).
"""
from collections.abc import AsyncGenerator
from dataclasses import replace
from types import SimpleNamespace
from typing import Any

import pytest
from google.adk.agents import LlmAgent
from google.adk.events import Event
from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import FunctionTool
from google.genai import types
from src.adk.agents import quote_agent
from src.adk.quote_gate import quote_agent_instruction, quote_step_gate
from src.adk.session_context import HOUSE_QUOTE_STATE_KEY, session_context_delta
from src.adk.turn_reading import last_turn_calls, turn_calls
from src.services.quote_step import (
    LOGIN_MESSAGE,
    LOGIN_TOOL,
    PHONE_QUESTION,
    REGISTER_TOOL,
    STEP_LINE_MARKER,
    STEP_REFUSED_PREFIX,
    QuoteFacts,
    QuoteStep,
    quote_step,
    step_guide,
    step_line,
    step_refusal,
)
from tests.unit.adk_event_fakes import TURN, text_event, user_message

BASE = QuoteFacts(
    is_guest=False,
    quote_status=None,
    delivery_status=None,
    card_pending=None,
    last_reply="",
    last_turn_calls=(),
    turn_calls=(),
    client_words="",
)


# ── The sentences the readers recognise ───────────────────────────────────────

def test_the_login_message_is_the_one_the_reader_recognises():
    """The next turn's step reads the login message back (a rebuilt session has no tool calls)."""
    assert quote_step(replace(BASE, is_guest=True, last_reply=LOGIN_MESSAGE)) is QuoteStep.ACCESSO
    assert quote_step(replace(BASE, last_reply=LOGIN_MESSAGE)) is QuoteStep.REGISTRA


@pytest.mark.parametrize("step", list(QuoteStep))
def test_every_step_has_a_guide(step):
    for action in (None, "update", "relay"):
        assert step_guide(step, action).strip()
    assert step_line(step, None).startswith(f"{STEP_LINE_MARKER}: {step.value} — ")


@pytest.mark.parametrize("step", list(QuoteStep))
def test_no_guide_sends_or_asks_to_confirm(step):
    """U1: the click on the card is the consent; the chat never asks "Confermi?"."""
    for action in (None, "update", "relay"):
        for sent in (False, True):
            guide = step_guide(step, action, quote_sent=sent)
            assert "submit_quote_request" not in guide and "Confermi?" not in guide


def test_collecting_registers_when_the_data_are_there():
    """U2: no "Preparo la richiesta?": the model calls the tool, the phone is asked once."""
    guide = step_guide(QuoteStep.RACCOLTA, None)
    assert REGISTER_TOOL in guide and PHONE_QUESTION in guide and "una sola volta" in guide
    assert "Preparo la richiesta" not in guide


def test_collecting_on_a_draft_updates_it():
    assert REGISTER_TOOL in step_guide(QuoteStep.RACCOLTA, "update")


def test_the_summary_points_to_the_button():
    guide = step_guide(QuoteStep.RIEPILOGO, "update")
    assert "Invia al team" in guide and "scheda" in guide


def test_the_card_points_to_the_button_too():
    guide = step_guide(QuoteStep.SCHEDA, "update")
    assert "Invia al team" in guide and "In un turno successivo" in guide


def test_the_sent_signal_is_confirmed_without_tools():
    guide = step_guide(QuoteStep.AL_TEAM, "relay", quote_sent=True)
    assert "inviato" in guide and "senza strumenti" in guide
    assert guide != step_guide(QuoteStep.AL_TEAM, "relay")


# ── Which tool each step admits ───────────────────────────────────────────────

def test_a_signed_in_client_registers_while_collecting():
    """The model decides when the data are enough (U2)."""
    assert step_refusal(QuoteStep.RACCOLTA, REGISTER_TOOL, registered_this_turn=False, is_guest=False) is None


@pytest.mark.parametrize("step", [QuoteStep.RACCOLTA, QuoteStep.ACCESSO])
def test_a_guest_logs_in_before_the_registration(step):
    """The tool would refuse a guest too, but its answer would count as a registration."""
    refusal = step_refusal(step, REGISTER_TOOL, registered_this_turn=False, is_guest=True)
    assert refusal is not None and refusal.startswith(STEP_REFUSED_PREFIX)
    assert LOGIN_MESSAGE in refusal and "request_login_adk" in refusal


def test_no_login_while_collecting():
    """A photo, a price question or the path chosen are no reason to ask the login."""
    refusal = step_refusal(QuoteStep.RACCOLTA, LOGIN_TOOL, registered_this_turn=False, is_guest=True)
    assert refusal is not None and REGISTER_TOOL in refusal


def test_the_login_runs_at_the_login_step():
    assert step_refusal(QuoteStep.ACCESSO, LOGIN_TOOL, registered_this_turn=False, is_guest=True) is None


@pytest.mark.parametrize(
    "step", [QuoteStep.REGISTRA, QuoteStep.SCHEDA, QuoteStep.RIEPILOGO, QuoteStep.AL_TEAM, QuoteStep.INOLTRO],
)
@pytest.mark.parametrize("tool", [REGISTER_TOOL, LOGIN_TOOL])
def test_the_other_steps_let_the_tools_run(step, tool):
    assert step_refusal(step, tool, registered_this_turn=False, is_guest=False) is None


@pytest.mark.parametrize("step", list(QuoteStep))
def test_one_registration_per_turn(step):
    refusal = step_refusal(step, REGISTER_TOOL, registered_this_turn=True, is_guest=False)
    assert refusal is not None and refusal.startswith(STEP_REFUSED_PREFIX)


@pytest.mark.parametrize("tool", ["save_contact_phone", "select_room", "get_room_context"])
def test_the_other_tools_are_never_gated(tool):
    assert step_refusal(QuoteStep.RACCOLTA, tool, registered_this_turn=True, is_guest=True) is None


# ── The callback on the ADK session ───────────────────────────────────────────

def _signed_in_state(quote: dict | None = None, phone: bool = True) -> dict:
    state: dict[str, Any] = session_context_delta(is_guest=False, phone_on_file=phone, session_id="proj-1")
    state[HOUSE_QUOTE_STATE_KEY] = {} if quote is None else quote
    return state


def _call_event(name: str, call_id: str, invocation_id: str = TURN) -> Event:
    call = types.FunctionCall(id=call_id, name=name, args={})
    return Event(author="quote", invocation_id=invocation_id,
                 content=types.Content(role="model", parts=[types.Part(function_call=call)]))


def _response_event(name: str, call_id: str, result: str, invocation_id: str = TURN) -> Event:
    response = types.FunctionResponse(id=call_id, name=name, response={"result": result})
    return Event(author="quote", invocation_id=invocation_id,
                 content=types.Content(role="user", parts=[types.Part(function_response=response)]))


def _tool_context(events: list[Event], state: dict, words: str, call_id: str) -> SimpleNamespace:
    return SimpleNamespace(
        invocation_id=TURN,
        user_content=user_message(words),
        function_call_id=call_id,
        session=SimpleNamespace(state=state, events=events),
    )


async def _gate(name: str, events: list[Event], state: dict, words: str, call_id: str = "c-now"):
    events = [*events, _call_event(name, call_id)]  # ADK appends the call before running the tool
    return await quote_step_gate(
        tool=SimpleNamespace(name=name), args={}, tool_context=_tool_context(events, state, words, call_id)
    )


def _parallel_event(*calls: tuple[str, str]) -> Event:
    """One model response with parallel calls: stored before any of them runs."""
    parts = [types.Part(function_call=types.FunctionCall(id=i, name=n, args={})) for n, i in calls]
    return Event(author="quote", invocation_id=TURN, content=types.Content(role="model", parts=parts))


async def _gate_parallel(name: str, call_id: str, calls: list[tuple[str, str]], state: dict, words: str,
                         before: list[Event] | None = None):
    events = [*(before or []), _parallel_event(*calls)]
    return await quote_step_gate(
        tool=SimpleNamespace(name=name), args={}, tool_context=_tool_context(events, state, words, call_id)
    )


def _guest_state() -> dict:
    return session_context_delta(is_guest=True, phone_on_file=False, session_id="proj-1")


async def test_the_gate_lets_a_signed_in_registration_run_while_collecting():
    assert await _gate(REGISTER_TOOL, [text_event("user", "rifare il bagno")], _signed_in_state(), "6 mq") is None


async def test_the_gate_refuses_a_guest_registration_with_the_login():
    response = await _gate(REGISTER_TOOL, [text_event("user", "rifare il bagno")], _guest_state(), "6 mq, Roma")
    assert response is not None and response["result"].startswith(STEP_REFUSED_PREFIX)
    assert LOGIN_MESSAGE in response["result"]


async def test_the_gate_lets_the_login_run_after_the_refused_registration():
    """The guest's collection is complete: the refused registration opens the login step."""
    events = [
        _call_event(REGISTER_TOOL, "c-reg"),
        _response_event(REGISTER_TOOL, "c-reg", f"{STEP_REFUSED_PREFIX} (passo: raccolta): …"),
    ]
    assert await _gate(LOGIN_TOOL, events, _guest_state(), "6 mq, Roma") is None


async def test_the_gate_refuses_the_login_while_collecting():
    response = await _gate(LOGIN_TOOL, [text_event("user", "rifare il bagno")], _guest_state(), "ecco una foto")
    assert response is not None and response["result"].startswith(STEP_REFUSED_PREFIX)


async def test_the_gate_refuses_a_second_registration_in_the_turn():
    events = [
        _call_event(REGISTER_TOOL, "c-first"),
        _response_event(REGISTER_TOOL, "c-first", "Richiesta registrata."),
    ]
    response = await _gate(REGISTER_TOOL, events, _signed_in_state(), "bagno 6 mq")
    assert response is not None and "già" in response["result"]


async def test_a_parallel_login_and_registration_are_both_held_back_while_collecting():
    calls = [(LOGIN_TOOL, "c-login"), (REGISTER_TOOL, "c-reg")]
    for name, call_id in calls:
        assert await _gate_parallel(name, call_id, calls, _guest_state(), "vorrei rifare il bagno") is not None


async def test_of_two_parallel_registrations_the_first_one_goes():
    calls = [(REGISTER_TOOL, "c-one"), (REGISTER_TOOL, "c-two")]
    assert await _gate_parallel(REGISTER_TOOL, "c-one", calls, _signed_in_state(), "bagno 6 mq") is None
    second = await _gate_parallel(REGISTER_TOOL, "c-two", calls, _signed_in_state(), "bagno 6 mq")
    assert second is not None and "già" in second["result"]


async def test_an_unread_house_quote_lets_the_registration_through():
    state = _signed_in_state()
    state[HOUSE_QUOTE_STATE_KEY] = None  # the read failed this turn
    assert await _gate(REGISTER_TOOL, [], state, "il bagno è 8 mq") is None


async def test_the_gate_lets_other_tools_through():
    assert await _gate("select_room", [], _signed_in_state(), "rifare il bagno") is None


async def test_the_gate_is_off_outside_a_chat_turn():
    """No session facts (an eval without the orchestrator): nothing to compute the step from."""
    assert await _gate(REGISTER_TOOL, [], {}, "rifare il bagno") is None


async def test_the_gate_logs_the_refusal_without_ids(caplog):
    caplog.set_level("WARNING")
    await _gate(REGISTER_TOOL, [], _guest_state(), "rifare il bagno")
    [record] = [r for r in caplog.records if getattr(r, "event", None) == "quote_step_gate"]
    assert record.quote_step == "raccolta" and record.tool == REGISTER_TOOL
    assert "proj-1" not in str(record.__dict__)


# ── A refused call is not a call ──────────────────────────────────────────────

def _refused_registration(invocation_id: str = TURN) -> list[Event]:
    return [
        _call_event(REGISTER_TOOL, "c-refused", invocation_id),
        _response_event(REGISTER_TOOL, "c-refused", f"{STEP_REFUSED_PREFIX} (passo: raccolta): …", invocation_id),
    ]


def test_a_refused_call_is_not_counted_in_the_turn():
    events = [*_refused_registration(), _call_event("select_room", "c-room")]
    assert turn_calls(events, TURN) == ["select_room"]


def test_the_gate_counts_only_the_calls_that_ran():
    events = [_parallel_event(("save_contact_phone", "c-phone"), (REGISTER_TOOL, "c-reg"))]
    assert turn_calls(events, TURN) == ["save_contact_phone", REGISTER_TOOL]
    assert turn_calls(events, TURN, answered_only=True) == []
    events.append(_response_event("save_contact_phone", "c-phone", "✅ Numero salvato."))
    assert turn_calls(events, TURN, answered_only=True) == ["save_contact_phone"]


def test_a_refused_call_is_not_counted_in_the_last_turn():
    events = [text_event("user", "bagno", "inv-before"), *_refused_registration("inv-before"),
              text_event("quote", "Raccontami del bagno.", "inv-before")]
    assert last_turn_calls(events, TURN) == []


# ── The step in the quote agent's instruction ─────────────────────────────────

def _readonly(state: dict, events: list[Event], words: str) -> SimpleNamespace:
    return SimpleNamespace(
        state=state, invocation_id=TURN, user_content=user_message(words),
        session=SimpleNamespace(state=state, events=events),
    )


def test_the_quote_agent_reads_its_step_in_the_session_block():
    events = [text_event("quote", "Quanti metri quadri è il bagno?")]
    block = quote_agent_instruction(_readonly(_signed_in_state(), events, "registra la richiesta"))
    line = step_line(QuoteStep.REGISTRA, None)
    assert line in block
    assert block.index("PREVENTIVO DELLA CASA") < block.index(line) < block.index("SCHEDA SYD")


def test_no_step_line_outside_a_chat_turn():
    assert STEP_LINE_MARKER not in quote_agent_instruction(_readonly({}, [], "ciao"))


def test_the_quote_agent_has_the_gate_and_the_step():
    assert quote_agent.before_tool_callback is quote_step_gate
    assert quote_agent.instruction is quote_agent_instruction
    prompt = str(quote_agent.static_instruction)
    assert STEP_LINE_MARKER in prompt and STEP_REFUSED_PREFIX in prompt


# ── With ADK's runner: the refused call and the step of the next model call ───

class _ScriptedLlm(BaseLlm):
    """Answers with the scripted responses in order and keeps the requests."""
    model: str = "scripted"
    script: list[types.Content] = []
    requests: list[LlmRequest] = []

    async def generate_content_async(
        self, llm_request: LlmRequest, stream: bool = False
    ) -> AsyncGenerator[LlmResponse, None]:
        self.requests.append(llm_request)
        yield LlmResponse(content=self.script[len(self.requests) - 1])


def _call(name: str) -> types.Content:
    return types.Content(role="model", parts=[types.Part(function_call=types.FunctionCall(name=name, args={}))])


def _say(text: str) -> types.Content:
    return types.Content(role="model", parts=[types.Part(text=text)])


async def _run_turn(state: dict, script: list[types.Content], words: str) -> tuple[list[Event], _ScriptedLlm, list[str]]:
    ran: list[str] = []

    async def suggest_quote_items() -> str:
        ran.append(REGISTER_TOOL)
        return "Richiesta registrata."

    async def request_login() -> str:
        ran.append(LOGIN_TOOL)
        return "Login mostrato."

    llm = _ScriptedLlm(script=script, requests=[])
    agent = LlmAgent(
        name="quote", model=llm, tools=[FunctionTool(suggest_quote_items), FunctionTool(request_login)],
        instruction=quote_agent_instruction, before_tool_callback=quote_step_gate,
    )
    service = InMemorySessionService()
    session = await service.create_session(app_name="gate", user_id="u1", state=state)
    for event in (text_event("user", "rifare il bagno"), text_event("quote", "Quanti metri quadri è?")):
        await service.append_event(session, event)
    runner = Runner(app_name="gate", agent=agent, session_service=service)
    async for _ in runner.run_async(user_id="u1", session_id=session.id, new_message=user_message(words)):
        pass
    stored = await service.get_session(app_name="gate", user_id="u1", session_id=session.id)
    assert stored is not None
    return list(stored.events), llm, ran


def _instruction_text(request: LlmRequest) -> str:
    return "\n".join(
        part.text or "" for content in request.contents for part in content.parts or [] if part.text
    ) + str(request.config.system_instruction or "")


async def test_with_the_runner_a_signed_in_client_is_registered_when_the_data_are_there():
    events, llm, ran = await _run_turn(_signed_in_state(), [_call(REGISTER_TOOL), _say("Fatto.")], "6 mq, Roma")
    assert ran == [REGISTER_TOOL]
    assert step_line(QuoteStep.RACCOLTA, None) in _instruction_text(llm.requests[0])
    assert step_line(QuoteStep.SCHEDA, None) in _instruction_text(llm.requests[1])
    assert turn_calls(events, events[-1].invocation_id) == [REGISTER_TOOL]


async def test_with_the_runner_a_guest_is_sent_to_the_login_and_not_registered():
    script = [_call(REGISTER_TOOL), _call(LOGIN_TOOL), _say(LOGIN_MESSAGE)]
    events, llm, ran = await _run_turn(_guest_state(), script, "6 mq, Roma")
    assert ran == [LOGIN_TOOL]
    responses = [p.function_response for e in events for p in (e.content.parts if e.content else []) or []
                 if p.function_response]
    assert str((responses[0].response or {})["result"]).startswith(STEP_REFUSED_PREFIX)
    # The model call after the refusal reads the login step; the refused call is not counted.
    assert step_line(QuoteStep.ACCESSO, None) in _instruction_text(llm.requests[1])
    assert turn_calls(events, events[-1].invocation_id) == [LOGIN_TOOL]
