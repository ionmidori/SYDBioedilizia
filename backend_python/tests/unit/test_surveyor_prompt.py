"""Phase 140 step 3: the quote agent leaves the measures to the confirmation card
when the quote tool points to it (no measure question twice, no amount)."""
from src.prompts.components.modes import MODE_B_SURVEYOR
from src.tools import quote_tools
from src.tools.quote_tools import MEASURES_TO_REPORT

_STEP_1 = MODE_B_SURVEYOR.split("**STEP 1 ")[1].split("**STEP 2 ")[0]


def test_the_agent_leaves_the_measures_to_the_card_the_tool_points_to():
    assert "scheda di conferma" in _STEP_1
    assert "Conferma le misure nella scheda qui sotto" in _STEP_1  # what the tool says (_CARD_MEASURES_NOTE)
    assert "nessuna domanda sulle misure" in _STEP_1


def test_the_agent_calls_the_tool_again_for_measures_given_in_words_or_new_work():
    """A confirmation on the card recalculates the request by itself; the tool reads what the chat says."""
    assert "ricalcola" in _STEP_1
    assert "dà o corregge misure a parole" in _STEP_1 and "aggiunge o cambia lavori" in _STEP_1


def test_after_the_card_the_agent_goes_on_to_the_send_step_without_the_tool():
    assert 'PREVENTIVO DELLA CASA indica "in preparazione"' in _STEP_1
    assert "STEP 2 senza richiamare il tool" in _STEP_1


def test_the_card_confirmation_is_no_consent_to_send():
    assert "la conferma delle misure nella scheda" in MODE_B_SURVEYOR.split("**STEP 2 ")[1].split("**STEP 3 ")[0]


def test_the_card_invitation_is_passed_on_without_amounts():
    assert "invito alla scheda" in _STEP_1


_MIDDLE = MODE_B_SURVEYOR.split("<middle ")[1].split("</middle>")[0]
_END_TRIGGER = MODE_B_SURVEYOR.split("<end>")[1].split("</trigger>")[0]
_START = MODE_B_SURVEYOR.split("<start>")[1].split("</start>")[0]


_GATE = MODE_B_SURVEYOR.split("<completeness_gate>")[1].split("</completeness_gate>")[0]
_METRICS = MODE_B_SURVEYOR.split('<pillar name="metrics"')[1].split("</pillar>")[0]


def test_the_floor_area_is_asked_once_per_room_before_the_tool():
    """Test chat of 18/11: nobody asked how big the bedroom was and the card showed
    SYD's estimate as if it were the client's. One question, the floor only."""
    assert "UNA volta per stanza" in _MIDDLE and "m² del pavimento" in _MIDDLE
    assert "Non chiedere le misure" not in _MIDDLE


def test_the_floor_area_is_not_asked_when_known_and_never_blocks():
    """Asking every measure first made the client type them twice and held the tool
    back (Phase 140, PR 1 · C): a known value is not asked, an unknown one does not wait."""
    assert "se li conosci già" in _MIDDLE and "scheda stanza" in _MIDDLE
    assert "non li sa" in _MIDDLE and "li stima SYD" in _MIDDLE


def test_an_explicit_request_to_prepare_the_quote_does_not_wait_for_the_floor_area():
    """"Prepara pure la richiesta" registers at once (eval measures_on_card)."""
    assert "chiede esplicitamente di preparare" in _MIDDLE and "non fermarti per i m²" in _MIDDLE
    assert "richiesta esplicita" in _END_TRIGGER


def test_an_unknown_floor_area_is_said_to_be_an_estimate():
    """The original complaint: the card showed SYD's estimate as if it were the client's."""
    assert "userai una stima" in _MIDDLE


def test_the_floor_area_is_one_question_for_all_rooms_never_repeated():
    assert "una sola domanda per tutte le stanze" in _MIDDLE
    assert "non richiederli" in _MIDDLE  # the client answered something else
    assert "il comune del cantiere e i m² del pavimento" in _MIDDLE  # the exceptions to "non COME"


def test_a_change_for_the_team_is_relayed_without_the_floor_area():
    relay = next(line for line in MODE_B_SURVEYOR.splitlines() if line.startswith('- Stato "inviato al team"'))
    assert "nemmeno i m² del pavimento" in relay


def test_the_other_measures_stay_on_the_card():
    for section in (_MIDDLE, _GATE, _METRICS):
        assert "m² del pavimento" in section and "scheda di conferma" in section
    assert "pareti, metri lineari" in _MIDDLE


def test_the_end_waits_for_the_floor_area_or_the_client_not_knowing_it():
    assert "Scope" in _END_TRIGGER and "m² del pavimento" in _END_TRIGGER and "non li sa" in _END_TRIGGER
    assert "Metriche" not in _END_TRIGGER
    assert "conferme sulle misure" not in _START


def test_values_and_state_are_reported_only_as_the_tool_gives_them():
    """The agent told "recepisco 8 mq" while the lines used the confirmed 5 (PR 1 · E)."""
    assert "calcolato su" in _STEP_1 and "come li riporta lo strumento" in _STEP_1
    # The rule names the heading the tool puts first (quote_tools.MEASURES_TO_REPORT).
    assert MEASURES_TO_REPORT in _STEP_1 and "parola per parola" in _STEP_1


def test_step_1_relays_the_rooms_left_out_of_the_quote():
    # The tool's note (quote_tools._IDLE_ROOM_NOTE) reaches the client as it is.
    assert quote_tools._IDLE_ROOM_NOTE.startswith("non ho lavori da quotare per questa stanza")
    assert "non ho lavori da quotare per questa stanza" in _STEP_1
    assert "non citarle nel riepilogo" in _STEP_1
    assert "non chiedere di nuovo i lavori di quella stanza" in _STEP_1
