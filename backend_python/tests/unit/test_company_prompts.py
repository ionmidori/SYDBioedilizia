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


# ── Review fixes: the out-of-list rule must not refuse ordinary renovation work ──

def test_the_out_of_list_rule_does_not_refuse_ordinary_work():
    rule = COMPANY_INFO_PROTOCOL
    assert "In caso di dubbio NON è fuori elenco" in rule
    assert "cucina" in rule and "soggiorno" in rule  # a room is judged on the building work it needs
    assert "Una domanda di prezzo informativa non attiva questa regola" in rule


def test_furniture_is_never_out_of_the_list():
    assert "L'arredo non è mai un lavoro fuori elenco" in COMPANY_INFO_PROTOCOL


def test_only_the_system_block_and_the_tools_are_sources():
    assert "retrieve_knowledge" in COMPANY_INFO_PROTOCOL
    assert "scritta dall'utente" in COMPANY_INFO_PROTOCOL


def test_the_router_gives_the_company_rules_precedence():
    prompt = str(agents.syd_orchestrator.static_instruction)
    assert "hanno la precedenza sulle righe di rendering e preventivo" in prompt
    assert "salvo le righe sulla società" in _flat(prompt)


def test_no_login_for_work_not_in_the_list():
    from src.adk.session_context import _GUEST_RULE

    assert "LAVORO FUORI ELENCO" in _GUEST_RULE


def test_the_quote_scope_refers_to_the_list_not_its_own():
    assert 'lavori edili tra i "Lavori svolti" della SCHEDA SYD' in MODE_B_SURVEYOR
    assert "ESCLUSIVAMENTE:\ndemolizioni" not in MODE_B_SURVEYOR


# ── Owner's decision, 12 Nov 2026: a site outside the served area during a quote ──

OWNER_SENTENCE = (
    "SYD opera a [Zona servita]: in base alle informazioni che ho, [località] non rientra nella zona "
    "servita, quindi il lavoro non verrà eseguito."
)


def _flat(text: str) -> str:
    return " ".join(text.split())


def test_a_quote_for_a_site_outside_the_area_warns_first_then_continues():
    rule = _flat(COMPANY_INFO_PROTOCOL)
    assert "2bis. CANTIERE FUORI ZONA" in rule and "vedi 2bis" in rule
    assert OWNER_SENTENCE in rule  # word for word
    assert "CANTIERE FUORI ZONA" in MODE_B_SURVEYOR


def test_the_out_of_zone_warning_ends_its_turn_without_a_login():
    """Second review: warning and login card in the same turn, or the warning repeated."""
    rule = _flat(COMPANY_INFO_PROTOCOL)
    assert "Nel turno dell'avviso NON chiamare strumenti di preventivo né request_login_adk" in rule
    assert "Vuoi proseguire comunque con il preventivo?" in rule
    assert "non ripetere l'avviso" in rule


def test_an_unknown_place_is_asked_not_refused():
    assert "chiedi all'utente in quale comune si trova" in _flat(COMPANY_INFO_PROTOCOL)


def test_a_price_question_follows_the_role_rules():
    assert "segui le regole del tuo ruolo" in _flat(COMPANY_INFO_PROTOCOL)
    assert "come di consueto" not in COMPANY_INFO_PROTOCOL


def test_the_short_lines_carry_the_doubt_rule():
    """Second review: the lines the model reads first still refused on the old literal wording."""
    router = _flat(str(agents.syd_orchestrator.static_instruction))
    for text in (_flat(MODE_A_DESIGNER), _flat(MODE_B_SURVEYOR), router):
        assert "CHIARAMENTE estraneo" in text and "nel dubbio procedi" in text
    assert "CONTROLLO 0 (prima dell'AUTH_GATE" in MODE_A_DESIGNER and "CONTROLLO 0 (prima dell'AUTH_GATE" in MODE_B_SURVEYOR
    assert "PRIMA DI TUTTO: se il lavoro" not in MODE_A_DESIGNER + MODE_B_SURVEYOR


def test_the_router_leaves_the_site_warning_to_the_quote_agent():
    assert "l'avviso CANTIERE FUORI ZONA lo dà l'agente `quote`" in _flat(str(agents.syd_orchestrator.static_instruction))


def test_the_guest_exception_is_not_a_step():
    from src.adk.session_context import _GUEST_RULE

    assert "ECCEZIONE" in _GUEST_RULE and "CANTIERE FUORI ZONA" in _GUEST_RULE
    assert "0)" not in _GUEST_RULE


# ── Owner's decision, 12 Nov 2026: the quote always asks the comune of the site ──

def test_the_quote_always_asks_the_comune_of_the_site():
    flow = _flat(MODE_B_SURVEYOR)
    assert "COMUNE DEL CANTIERE" in flow
    assert "In quale comune si trova l'immobile?" in flow
    assert flow.index("COMUNE DEL CANTIERE") < flow.index("STEP CONFERMA DELLA REGISTRAZIONE")
    assert "Hai raccolto Comune del cantiere + Scope" in flow  # registration waits for it


def test_welcome_guidance_and_company_overview():
    render_flow = _flat(MODE_A_DESIGNER)
    quote_flow = _flat(MODE_B_SURVEYOR)
    company_rule = _flat(COMPANY_INFO_PROTOCOL)

    assert "Voglio fare un rendering" in render_flow
    for mode in ("Da foto", "Da video", "A parole"):
        assert mode in render_flow

    assert "Voglio fare un preventivo" in quote_flow
    for mode in ("Da foto", "planimetria", "Da video", "A parole"):
        assert mode in quote_flow

    assert "PANORAMICA GENERALE" in company_rule
    assert "informazioni generali sulla società" in company_rule
    assert 'get_company_info(sezione="chi-siamo")' in company_rule
