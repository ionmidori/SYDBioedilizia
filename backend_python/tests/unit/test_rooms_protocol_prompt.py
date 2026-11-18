"""19/11: several photos in one turn. SYD first works out which rooms they show,
lets the client correct the names, and asks which room to start from; the
analysis of a room starts only when the client picks it."""
from src.prompts.components.modes import ROOMS_PROTOCOL

_MANY = ROOMS_PROTOCOL.split("PIÙ FOTO INSIEME")[1].split("\n3. ")[0]


def test_several_photos_are_only_sorted_into_rooms_that_turn():
    assert "assign_media_to_room" in _MANY
    assert "Foto 1 e 2: Soggiorno, Foto 3: Bagno" in _MANY
    assert "da quale stanza partire" in _MANY
    assert "niente descrizione e niente misure" in _MANY


def test_a_correction_renames_or_splits_the_rooms():
    assert "rename_room" in _MANY
    assert "due stanze diverse" in _MANY and "select_room" in _MANY
    assert "mostra di nuovo l'elenco" in _MANY


def test_the_chosen_room_starts_with_select_room():
    assert "una stanza alla volta" in _MANY
    assert "select_room" in _MANY.split("da quale stanza partire")[1]


def test_a_single_photo_keeps_the_old_rule():
    assert "Se l'immagine è ambigua" in ROOMS_PROTOCOL


def test_the_router_upload_rules_defer_to_the_room_list():
    from src.adk.agents import SYD_ORCHESTRATOR_INSTRUCTION

    intent_first = SYD_ORCHESTRATOR_INSTRUCTION.split("Regola Intent-First su Upload")[1].split("### ")[0]
    quote_context = SYD_ORCHESTRATOR_INSTRUCTION.split("Regola Contesto Preventivo su Upload")[1].split("### ")[0]
    for rule in (intent_first, quote_context):
        assert "2bis PIÙ FOTO INSIEME" in rule and "da quale stanza partire" in rule


# ── Review fixes: the agents that see 2bis can follow it ────────────────────

def test_the_room_list_turn_is_a_single_question_and_skips_the_1_2_3_question():
    from src.adk.agents import SYD_ORCHESTRATOR_INSTRUCTION

    assert "È giusto? Da quale stanza partiamo?" in _MANY
    intent_first = SYD_ORCHESTRATOR_INSTRUCTION.split("Regola Intent-First su Upload")[1].split("### ")[0]
    assert "senza la domanda 1/2/3" in intent_first


def test_photos_already_in_one_room_skip_the_room_list():
    assert "almeno una" in _MANY and '"senza stanza"' in _MANY
    assert "tutte della stessa stanza già indicata" in _MANY


def test_a_guest_gets_the_list_in_words():
    assert "utenti registrati" in _MANY and "a parole" in _MANY


def test_the_full_photo_analyses_wait_for_the_room_list():
    from src.adk.agents import TRIAGE_AGENT_INSTRUCTION
    from src.prompts.components.modes import MODE_A_DESIGNER

    triage = TRIAGE_AGENT_INSTRUCTION.split("FORMATO OBBLIGATORIO")[1].split('"Ho analizzato')[0]
    vision = MODE_A_DESIGNER.split('<phase name="1_vision"')[1].split("</instruction>")[0]
    for block in (triage, vision):
        assert "2bis PIÙ FOTO INSIEME" in block


def test_every_agent_with_the_rooms_protocol_has_the_room_tools():
    from src.adk import tools
    from src.adk.agents import design_agent, quote_agent, syd_orchestrator, triage_agent

    for agent in (syd_orchestrator, triage_agent, design_agent, quote_agent):
        assert {tools.assign_media_to_room_adk, tools.rename_room_adk, tools.select_room_adk} <= set(agent.tools)


def test_the_guest_message_fits_every_room_tool():
    from src.adk.tools import _ROOMS_LOGIN_REQUIRED

    assert "select_room" not in _ROOMS_LOGIN_REQUIRED["message"]
