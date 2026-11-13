"""Phase 140 step 3: the quote agent leaves the measures to the confirmation card
when the quote tool points to it (no measure question twice, no amount)."""
from src.prompts.components.modes import MODE_B_SURVEYOR
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


def test_the_measures_are_not_collected_in_words_before_the_tool():
    """The card asks them after suggest_quote_items: asking first made the client
    type them twice, and the tool was called only after the measures (PR 1 · C)."""
    assert "misure in modo naturale" not in _MIDDLE
    assert "Non chiedere le misure" in _MIDDLE and "scheda di conferma" in _MIDDLE
    assert "Metriche" not in _END_TRIGGER and "Scope" in _END_TRIGGER
    assert "conferme sulle misure" not in _START


def test_values_and_state_are_reported_only_as_the_tool_gives_them():
    """The agent told "recepisco 8 mq" while the lines used the confirmed 5 (PR 1 · E)."""
    assert "calcolato su" in _STEP_1 and "come li riporta lo strumento" in _STEP_1
    # The rule names the heading the tool puts first (quote_tools.MEASURES_TO_REPORT).
    assert MEASURES_TO_REPORT in _STEP_1 and "parola per parola" in _STEP_1
