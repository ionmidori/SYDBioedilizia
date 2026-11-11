"""
The owner's rules on company questions (Phase 141) in every agent's prompt.

The prompts hold rules, never facts: contacts, served area and site visit come
from the SCHEDA SYD block and the company tools, so an edit in the admin
console reaches the assistant without touching a prompt. The rule texts quote
the owner word for word.
"""
import pytest
from src.adk import agents
from src.adk.company_context import COMPANY_LABELS
from src.prompts.components.company import COMPANY_INFO_PROTOCOL
from src.prompts.components.modes import MODE_A_DESIGNER, MODE_B_SURVEYOR
from src.prompts.components.security import SECURITY_GUARDRAILS, SECURITY_GUARDRAILS_TAIL
from src.services.company_info import seed_info
from src.tools.company_tools import AREA_NOT_SERVED, AREA_SERVED, SECTION_EMPTY, SECTION_UNKNOWN

ALL_AGENTS = (agents.syd_orchestrator, agents.triage_agent, agents.design_agent, agents.quote_agent)


@pytest.mark.parametrize("agent", ALL_AGENTS, ids=lambda a: a.name)
def test_every_agent_carries_the_company_protocol(agent):
    prompt = str(agent.static_instruction)
    assert COMPANY_INFO_PROTOCOL in prompt
    assert prompt.index(COMPANY_INFO_PROTOCOL) < prompt.index(SECURITY_GUARDRAILS_TAIL)


def test_the_protocol_names_what_the_block_and_tools_write():
    for label in COMPANY_LABELS:
        assert f'"{label}"' in COMPANY_INFO_PROTOCOL, label
    for word in (SECTION_EMPTY, SECTION_UNKNOWN, AREA_SERVED, AREA_NOT_SERVED,
                 "get_company_info", "check_service_area", "SCHEDA SYD"):
        assert word in COMPANY_INFO_PROTOCOL, word


def test_the_user_rules_are_word_for_word():
    assert "in base alle informazioni che ho, [località] non rientra" in COMPANY_INFO_PROTOCOL
    assert "Questa lavorazione non è indicata come attività svolta da SYD." in COMPANY_INFO_PROTOCOL


@pytest.mark.parametrize("agent", ALL_AGENTS, ids=lambda a: a.name)
def test_no_company_fact_is_hardcoded_in_a_prompt(agent):
    info = seed_info()
    prompt = str(agent.static_instruction).lower()
    for value in (info.identity.phone, info.identity.email, info.identity.vat_id,
                  info.identity.address.street, info.service_area.summary):
        assert value.lower() not in prompt, value


def test_the_router_answers_company_questions_itself():
    prompt = str(agents.syd_orchestrator.static_instruction)
    assert "protocollo company_info" in prompt and "LAVORO FUORI ELENCO" in prompt


def test_render_and_quote_stop_on_work_not_in_the_list():
    assert "LAVORO FUORI ELENCO" in MODE_A_DESIGNER
    assert "LAVORO FUORI ELENCO" in MODE_B_SURVEYOR
    assert "mobile lavabo" in MODE_B_SURVEYOR  # the furniture rule of 10 Nov stays


def test_company_questions_are_in_scope():
    assert "SYD Bioedilizia itself" in SECURITY_GUARDRAILS
