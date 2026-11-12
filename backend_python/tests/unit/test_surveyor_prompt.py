"""Phase 140 step 3: the quote agent leaves the measures to the confirmation card
when the quote tool points to it (no measure question twice, no amount)."""
from src.prompts.components.modes import MODE_B_SURVEYOR

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
