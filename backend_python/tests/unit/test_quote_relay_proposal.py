"""The team has the quote: a change asked in the chat is analysed like a first
quote, but becomes an AI revision proposal for the team (relay plan, PR 3).
Nothing is written on the quote, on the room specs or on the card."""
from contextlib import contextmanager
from unittest.mock import AsyncMock, patch

from src.services.insight_engine import InsightAnalysis, InsightEngineError
from src.services.quote_drafts import QuoteStatusView
from src.services.quote_followup import FollowupResult
from src.services.quote_proposal import ProposalDraft
from src.tools import quote_tools
from tests.unit.test_room_quote import ANALYSES, _bathroom, _project, _quote, _s, _stored

WITH_THE_TEAM = QuoteStatusView(
    status="in_review", delivery_status=None, quote_number="PRV-2026-0042", version=3, sent_before=False,
)
RELAYED = FollowupResult("in_review", "PRV-2026-0042", notified=True)


@contextmanager
def _relay(relayed=(RELAYED,), **project):
    """A project whose quote the team has; `relayed`, what each relay returns."""
    relay = AsyncMock(side_effect=list(relayed))
    with _project(**project) as mocks, \
         patch.object(quote_tools, "read_quote_status", AsyncMock(return_value=WITH_THE_TEAM)), \
         patch.object(quote_tools, "relay_client_request", relay):
        yield {**mocks, "relay": relay}


def _proposal(relay: AsyncMock) -> ProposalDraft | None:
    return relay.await_args.kwargs.get("proposal")


async def test_the_change_is_analysed_and_relayed_as_a_proposal():
    with _relay() as mocks:
        reply = await _quote()

    assert mocks["analyze"].await_count == 3  # Bagno, Cucina, Generale: like a first quote
    proposal = _proposal(mocks["relay"])
    assert proposal is not None
    assert {item.room_id for item in proposal.built.quote.items} >= {"bagno1", "cucina1"}
    assert "Bagno" in proposal.summary and "Cucina" in proposal.summary
    assert "proposta" in reply and "PRV-2026-0042" in reply
    assert "€" not in reply  # the client never sees prices


async def test_the_proposal_writes_no_quote_and_no_spec():
    with _relay() as mocks:
        await _quote()

    mocks["saved"].assert_not_awaited()
    mocks["store"].update.assert_not_awaited()


async def test_an_analysis_failure_relays_the_request_as_before():
    with _relay(engine=AsyncMock(side_effect=InsightEngineError("boom"))) as mocks:
        reply = await _quote()

    mocks["relay"].assert_awaited_once()
    assert _proposal(mocks["relay"]) is None
    assert "già in mano al nostro team tecnico" in reply
    mocks["saved"].assert_not_awaited()


_MISSING_TOP = {
    **ANALYSES,
    "Cucina": InsightAnalysis(summary="Cucina", completeness_score=0.4, missing_info=["Quanti metri di top?"],
                              suggestions=[_s("CUC-TOP-002", 1)]),
}


async def test_a_missing_measure_is_asked_and_the_team_is_told_without_a_proposal():
    """The team learns of the request now; the proposal follows the client's answer."""
    with _relay(analyses=_MISSING_TOP) as mocks:
        reply = await _quote()

    assert "**Cucina**: Quanti metri di top?" in reply
    mocks["relay"].assert_awaited_once()
    assert _proposal(mocks["relay"]) is None
    assert "segnalato al team" in reply and "preventivo **PRV-2026-0042**" in reply
    assert "quando mi rispondi" in reply
    assert "scheda" not in reply  # the card cannot be confirmed while the team has the quote
    mocks["saved"].assert_not_awaited()
    mocks["store"].update.assert_not_awaited()


async def test_a_refusal_with_nothing_to_answer_relays_without_awaiting_an_answer():
    """SKUs out of the price book: the team learns of the request, no answer is awaited."""
    unknown = {name: InsightAnalysis(summary=name, completeness_score=0.9, suggestions=[_s("XXX-999", 1)])
               for name in ("Bagno", "Cucina")}
    with _relay(analyses={**ANALYSES, **unknown}) as mocks:
        reply = await _quote()

    assert "consulente ti contatterà" in reply
    mocks["relay"].assert_awaited_once()
    assert _proposal(mocks["relay"]) is None
    assert "segnalato al team" in reply and "quando mi rispondi" not in reply


async def test_a_missing_measure_with_the_quote_handed_back_only_asks():
    """The status changed: nothing was relayed, so nothing is claimed."""
    with _relay(relayed=(None,), analyses=_MISSING_TOP) as mocks:
        reply = await _quote()

    assert "**Cucina**: Quanti metri di top?" in reply
    assert "segnalato al team" not in reply
    mocks["saved"].assert_not_awaited()


async def test_a_status_change_during_the_analysis_drafts_as_usual():
    with _relay(relayed=(None,)) as mocks:
        reply = await _quote()

    mocks["saved"].assert_awaited_once()
    assert mocks["store"].update.await_count >= 2  # the room specs are saved for the card
    assert "Ho registrato la tua richiesta di preventivo" in reply


async def test_a_card_confirmation_during_the_run_still_reaches_the_draft():
    """The client confirms 8 mq on the card while SYD analyses and the team hands
    the quote back meanwhile: the draft uses the 8, not the model's 6."""
    confirmed = _stored(measures=[{"name": "mq", "value": 8, "source": "confirmed"}])
    with _relay(relayed=(None,), analyses={**ANALYSES, "Bagno": _bathroom()},
                specs_at_save={"bagno1": confirmed}) as mocks:
        await _quote()

    quote = mocks["saved"].await_args.args[2]
    bagno = {i.sku: i.qty for i in quote.items if i.room_id == "bagno1"}
    assert bagno["BAG-RIV-001"] == 18.48 and bagno["MUR-004"] == 17.6  # 8 * 2.2 * 1.05, 8 * 2.2
