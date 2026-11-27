"""Final review of PR A (card-recap flow): the findings fixed in one pass, each pinned here.

- the phone question is asked only to a client with an account (a guest's number would be lost);
- the turn of the "Invia al team" signal runs no quote tool (it would relay a fake change);
- a guest's login goes through the refused registration in every text the model reads;
- the tool's replies never read as if the request were already with the team.
"""
import inspect

import pytest
from src.adk import agents, tools
from src.adk.session_context import _GUEST_RULE
from src.prompts.components.modes import MODE_B_SURVEYOR
from src.services.quote_step import (
    LOGIN_TOOL,
    PHONE_QUESTION,
    REGISTER_TOOL,
    STEP_REFUSED_PREFIX,
    QuoteStep,
    step_guide,
    step_refusal,
)


@pytest.mark.parametrize("step", [QuoteStep.RACCOLTA, QuoteStep.SCHEDA])
def test_the_phone_is_never_asked_to_a_guest(step):
    """save_contact_phone writes under the guest's session: the claim does not move it."""
    assert PHONE_QUESTION not in step_guide(step, None, is_guest=True)


@pytest.mark.parametrize("step", [QuoteStep.RACCOLTA, QuoteStep.SCHEDA])
def test_the_phone_is_asked_once_to_a_client_with_an_account(step):
    assert PHONE_QUESTION in step_guide(step, None, is_guest=False)


@pytest.mark.parametrize("tool", [REGISTER_TOOL, LOGIN_TOOL])
def test_the_send_signal_runs_no_quote_tool(tool):
    refusal = step_refusal(QuoteStep.AL_TEAM, tool, registered_this_turn=False, is_guest=False, quote_sent=True)
    assert refusal is not None and refusal.startswith(STEP_REFUSED_PREFIX)


def test_a_change_with_the_team_is_still_relayed_without_the_signal():
    assert step_refusal(QuoteStep.INOLTRO, REGISTER_TOOL, registered_this_turn=False, is_guest=False) is None


_AUTH_GATE = MODE_B_SURVEYOR.split("STEP AUTH_GATE (il PASSO")[1].split("Poi esegui il HITL QUOTE WORKFLOW")[0]


def test_the_auth_gate_registers_first_and_logs_in_when_the_tool_asks():
    """The gate refuses the login while collecting: calling it first costs two model rounds."""
    assert _AUTH_GATE.index("suggest_quote_items") < _AUTH_GATE.index("request_login")
    assert "ti risponde di chiedere l'accesso" in _AUTH_GATE


def test_the_guest_rule_never_puts_the_login_in_place_of_the_quote_tool():
    step_2 = _GUEST_RULE.split("2)")[1].split("3)")[0]
    assert "rendering confermato" in step_2 and "suggest_quote_items te lo chiede" in step_2
    assert "al posto del tool premium" not in step_2 or "rendering" in step_2.split("al posto del tool premium")[0]


def test_the_login_tool_contract_follows_the_new_flow():
    doc = inspect.getdoc(tools.request_login) or ""
    assert "suggest_quote_items" in doc and "CONFIRMED a render or a quote" not in doc


def test_the_router_has_no_quote_confirmation_turn():
    prompt = str(agents.syd_orchestrator.instruction) + str(agents.syd_orchestrator.static_instruction)
    assert "CONFERMA il rendering o il preventivo" not in prompt
    assert "la conferma del preventivo" not in prompt
