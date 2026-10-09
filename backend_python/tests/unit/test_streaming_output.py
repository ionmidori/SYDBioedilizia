"""
Token streaming with output guardrails (chat latency plan, Phase 3).

- StreamingOutputGuard: leak filter that is safe on chunked text.
- _TurnText: turn text with "stream-then-verify" retraction (data-redact).
- ADKOrchestrator: partial events streamed once, no duplicated final text,
  run_async called with SSE streaming.
- Model Armor output callback skips partial chunks.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from google.adk.agents.run_config import StreamingMode
from src.adk.adk_orchestrator import _TurnText
from src.adk.filters import MASKED_REPLY, StreamingOutputGuard
from src.adk.guardrails import model_armor_after_model
from tests.unit.test_adk_orchestrator import (
    _collect_chunks,
    _make_function_call_event,
    _make_orchestrator_with_events,
    _make_request_and_user,
    _make_text_event,
    _parse_sse,
    _setup_mocks,
)

# ── StreamingOutputGuard ────────────────────────────────────────────────────


LONG = "Per rifare il pavimento servono queste lavorazioni principali: rimozione, massetto, posa. " * 3


def test_guard_holds_back_a_trailing_window_and_the_token_being_written():
    guard = StreamingOutputGuard()
    released = guard.feed(LONG + "parola_in_corso")
    # Released text ends on a word boundary and stays >= 120 chars behind.
    assert released.endswith(" ")
    assert len(LONG) + len("parola_in_corso") - len(released) >= 120
    assert guard.finish() == (LONG + "parola_in_corso")[len(released):]
    assert guard.emitted == LONG + "parola_in_corso"


def test_guard_short_replies_are_released_only_at_the_end():
    guard = StreamingOutputGuard()
    assert guard.feed("Ciao, il prezzo è 30 €") == ""
    assert guard.finish() == "Ciao, il prezzo è 30 €"


def test_guard_never_releases_a_path_inside_a_multi_word_traceback_line():
    # Security review: `File "<path>", line N` spans several words; the path
    # must not be released before ", line N" arrives and the pattern matches.
    guard = StreamingOutputGuard()
    released = guard.feed(LONG + 'Errore: File "/app/progetto/moduli/calcolo.py",')
    released += guard.feed(" line 42 in calcola")
    assert "calcolo.py" not in released
    assert guard.tripped


def test_guard_never_emits_an_email_split_across_chunks():
    guard = StreamingOutputGuard()
    released = guard.feed("Scrivi a mario.rossi@")
    released += guard.feed("example.com per info")
    assert "mario" not in released
    assert guard.tripped
    assert guard.finish() == ""


def test_guard_caps_the_holdback_on_long_tokens():
    guard = StreamingOutputGuard()
    released = guard.feed("x" * 500)
    assert len(released) == 300


# ── _TurnText ───────────────────────────────────────────────────────────────


def _deltas(chunks):
    return "".join(c["delta"] for c in chunks if c["type"] == "text-delta")


async def test_partials_then_identical_final_stream_each_word_once():
    turn = _TurnText()
    out = turn.feed_partial("Ciao ") + turn.feed_partial("come stai?")
    out += await turn.feed_final("Ciao come stai?")
    assert _deltas(out) == "Ciao come stai?"
    assert turn.text == "Ciao come stai?"
    assert not turn.redacted


async def test_final_replaced_by_guardrail_retracts_only_this_call():
    turn = _TurnText()
    turn.feed_partial("Prima risposta. ")
    await turn.feed_final("Prima risposta. ")
    turn.feed_partial("Testo con dati ")
    out = await turn.feed_final("Risposta filtrata da Model Armor.")
    assert out == [{"type": "data-redact", "id": "redact",
                    "data": {"text": "Prima risposta. Risposta filtrata da Model Armor."}}]
    assert turn.redacted


async def test_leak_mid_stream_retracts_with_masked_reply():
    turn = _TurnText()
    turn.feed_partial("Il tuo codice fiscale è ")
    out = turn.feed_partial("RSSMRA80A01H501U grazie")
    assert out[-1]["type"] == "data-redact"
    assert out[-1]["data"]["text"] == MASKED_REPLY
    # The rest of the call adds nothing and does not retract twice.
    assert await turn.feed_final("Il tuo codice fiscale è RSSMRA80A01H501U grazie") == []


async def test_after_a_retraction_updates_are_sent_as_redact():
    turn = _TurnText()
    turn.feed_partial("dati ")
    await turn.feed_final("Bloccato.")
    out = turn.feed_partial(LONG)
    assert out[-1]["type"] == "data-redact"
    assert out[-1]["data"]["text"].startswith("Bloccato.Per rifare")


async def test_verify_then_stream_mode_sends_text_only_after_the_final_scan():
    turn = _TurnText(stream=False)
    assert turn.feed_partial(LONG) == []
    out = await turn.feed_final(LONG)
    assert _deltas(out) == LONG


async def test_non_streamed_final_is_filtered_as_a_whole():
    turn = _TurnText()
    out = await turn.feed_final("Risposta senza streaming")
    assert _deltas(out) == "Risposta senza streaming"


# ── Orchestrator ────────────────────────────────────────────────────────────


@patch("src.core.config.settings")
@patch("src.adk.adk_orchestrator.get_conversation_repository")
@patch("src.adk.adk_orchestrator.get_session_service")
async def test_orchestrator_streams_partials_without_duplicating_final(
    mock_get_session, mock_get_repo, mock_settings
):
    _setup_mocks(mock_get_session, mock_get_repo, mock_settings)
    partial_fc = _make_function_call_event("search_listino")
    partial_fc.partial = True  # partial function calls must be ignored
    events = [
        _make_text_event("Ecco ", partial=True),
        _make_text_event("il preventivo.", partial=True),
        partial_fc,
        _make_text_event("Ecco il preventivo.", partial=False),
    ]
    orch = _make_orchestrator_with_events(events)
    req, user = _make_request_and_user()

    parsed = _parse_sse(await _collect_chunks(orch.stream_chat(req, user)))

    text = "".join(p["delta"] for p in parsed if isinstance(p, dict) and p.get("type") == "text-delta")
    assert text == "Ecco il preventivo."
    assert not any(isinstance(p, dict) and p.get("type") == "data-tool_call" for p in parsed)
    run_config = orch.runner.run_async.call_args.kwargs["run_config"]
    assert run_config.streaming_mode == StreamingMode.SSE
    saved = mock_get_repo.return_value.save_message.call_args.kwargs
    assert saved["content"] == "Ecco il preventivo."


# ── Model Armor output callback ─────────────────────────────────────────────


def test_model_armor_output_skips_partial_chunks():
    service = MagicMock()
    with patch("src.adk.guardrails.get_model_armor_service", return_value=service):
        result = model_armor_after_model(
            SimpleNamespace(agent_name="syd_orchestrator", invocation_id="i"),
            SimpleNamespace(partial=True, content=None),
        )
    assert result is None
    service.sanitize_response.assert_not_called()
