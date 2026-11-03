from unittest.mock import AsyncMock, patch

import pytest
from src.services.insight_engine import InsightAnalysis, SKUItemSuggestion
from src.services.quote_dossier import DossierInputs
from src.services.quote_drafts import DraftSaveOutcome, DraftSaveResult, QuoteStatusView
from src.services.quote_followup import FollowupResult
from src.tools.quote_tools import suggest_quote_items_wrapper


@pytest.mark.asyncio
async def test_suggest_quote_items_wrapper_success():
    # Mock ConversationRepository
    with patch("src.tools.quote_tools.ConversationRepository") as MockRepo:
        mock_repo_instance = MockRepo.return_value
        mock_repo_instance.get_context = AsyncMock(return_value=[
            {"role": "user", "content": "I want to renovate my 20mq living room.", "attachments": []}
        ])

        # Mock InsightEngine
        with patch("src.tools.quote_tools.get_insight_engine") as mock_get_engine:
            mock_engine_instance = mock_get_engine.return_value
            mock_engine_instance.analyze_project_for_quote = AsyncMock(return_value=InsightAnalysis(
                suggestions=[
                    SKUItemSuggestion(sku="DEM-001", qty=20.0, ai_reasoning="Remove old floor"),
                    SKUItemSuggestion(sku="PAV-001", qty=20.0, ai_reasoning="New tiles")
                ],
                summary="Renovation of living room floor."
            ))

            # Mock persistence: the draft goes through the transactional
            # save_ai_draft (never a blind set() on the quote document).
            with patch("src.tools.quote_tools.get_async_firestore_client"), patch(
                "src.tools.quote_tools.read_quote_status", new=AsyncMock(return_value=None)
            ), patch(
                "src.tools.quote_tools.gather_dossier_inputs", new=AsyncMock(return_value=DossierInputs())
            ), patch(
                "src.tools.quote_tools.save_ai_draft",
                new=AsyncMock(
                    return_value=DraftSaveResult(DraftSaveOutcome.CREATED, "draft", "PRV-2026-0001", 1)
                ),
            ) as mock_save:
                # Execute
                result = await suggest_quote_items_wrapper(
                    session_id="test_session",
                    project_id="test_project",
                    user_id="test_user"
                )

                # Verify: neutral summary only — the draft is CONFIDENTIAL
                # (admin reviews it first; client never sees items/prices in chat)
                assert "Renovation of living room floor" in result
                assert "2 lavorazioni" in result
                assert "PRV-2026-0001" in result
                assert "Demolizione tramezzi" not in result
                assert "Subtotale" not in result
                assert "€" not in result

                mock_save.assert_awaited_once()
                _db, project_id, quote, request = mock_save.await_args.args
                assert mock_save.await_args.kwargs["dossier"] == DossierInputs()
                assert project_id == "test_project"
                assert quote.items[0].sku == "DEM-001"
                assert quote.financials.grand_total > 0
                assert request.summary == "Renovation of living room floor."
                assert request.channel == "chat"
                assert request.session_id == "test_session"


def _engine(mock_get_engine):
    mock_get_engine.return_value.analyze_project_for_quote = AsyncMock(return_value=InsightAnalysis(
        suggestions=[SKUItemSuggestion(sku="DEM-001", qty=6.0, ai_reasoning="Demolizione")],
        summary="Rifacimento bagno.",
    ))
    return mock_get_engine.return_value.analyze_project_for_quote


def _status(status: str, *, sent_before: bool = False, delivery: str | None = None) -> QuoteStatusView:
    return QuoteStatusView(status=status, delivery_status=delivery, quote_number="PRV-2026-0009", version=4,
                           sent_before=sent_before)


@pytest.mark.asyncio
@pytest.mark.parametrize("status", ["pending_review", "in_review", "approved"])
async def test_a_quote_the_team_has_is_relayed_without_analysing_the_project(status):
    relay = AsyncMock(return_value=FollowupResult(status, "PRV-2026-0009", notified=True))
    with patch("src.tools.quote_tools.ConversationRepository") as MockRepo, patch(
        "src.tools.quote_tools.get_insight_engine"
    ) as mock_get_engine, patch("src.tools.quote_tools.get_async_firestore_client"), patch(
        "src.tools.quote_tools.read_quote_status", new=AsyncMock(return_value=_status(status))
    ), patch("src.tools.quote_tools.relay_client_request", new=relay), patch(
        "src.tools.quote_tools.save_ai_draft", new=AsyncMock()
    ) as mock_save:
        analyse = _engine(mock_get_engine)
        MockRepo.return_value.get_context = AsyncMock(return_value=[])
        result = await suggest_quote_items_wrapper(session_id="s1", project_id="p1", user_id="u1")

    relay.assert_awaited_once()
    assert relay.await_args.args[1] == "p1"
    analyse.assert_not_awaited()  # no vision/InsightEngine cost for a request we do not write
    mock_save.assert_not_awaited()
    assert "PRV-2026-0009" in result
    assert "ho segnalato" in result
    assert "Vuoi che invii" not in result


@pytest.mark.asyncio
async def test_a_quote_taken_by_the_team_during_the_analysis_is_relayed():
    relay = AsyncMock(return_value=FollowupResult("in_review", "PRV-2026-0009", notified=True))
    saved = DraftSaveResult(DraftSaveOutcome.WITH_THE_TEAM, "in_review", "PRV-2026-0009", 4)
    with patch("src.tools.quote_tools.ConversationRepository") as MockRepo, patch(
        "src.tools.quote_tools.get_insight_engine"
    ) as mock_get_engine, patch("src.tools.quote_tools.get_async_firestore_client"), patch(
        "src.tools.quote_tools.read_quote_status", new=AsyncMock(return_value=_status("draft"))
    ), patch("src.tools.quote_tools.relay_client_request", new=relay), patch(
        "src.tools.quote_tools.gather_dossier_inputs", new=AsyncMock(return_value=DossierInputs())
    ), patch("src.tools.quote_tools.save_ai_draft", new=AsyncMock(return_value=saved)):
        _engine(mock_get_engine)
        MockRepo.return_value.get_context = AsyncMock(return_value=[
            {"role": "user", "content": "Rifai il bagno di 6 mq", "attachments": []}
        ])
        result = await suggest_quote_items_wrapper(session_id="s1", project_id="p1", user_id="u1")

    relay.assert_awaited_once()
    assert "ho segnalato" in result and "Vuoi che invii" not in result


@pytest.mark.asyncio
@pytest.mark.parametrize("sent_before", [True, False])
async def test_a_new_request_on_a_sent_quote_opens_a_revision(sent_before):
    saved = DraftSaveResult(DraftSaveOutcome.REVISED, "draft", "PRV-2026-0009", 5, sent_before)
    with patch("src.tools.quote_tools.ConversationRepository") as MockRepo, patch(
        "src.tools.quote_tools.get_insight_engine"
    ) as mock_get_engine, patch("src.tools.quote_tools.get_async_firestore_client"), patch(
        "src.tools.quote_tools.read_quote_status",
        new=AsyncMock(return_value=_status("sent" if sent_before else "rejected", sent_before=sent_before)),
    ), patch("src.tools.quote_tools.relay_client_request", new=AsyncMock()) as relay, patch(
        "src.tools.quote_tools.gather_dossier_inputs", new=AsyncMock(return_value=DossierInputs())
    ), patch("src.tools.quote_tools.save_ai_draft", new=AsyncMock(return_value=saved)):
        _engine(mock_get_engine)
        MockRepo.return_value.get_context = AsyncMock(return_value=[
            {"role": "user", "content": "Aggiungi anche la cucina", "attachments": []}
        ])
        result = await suggest_quote_items_wrapper(session_id="s1", project_id="p1", user_id="u1")

    relay.assert_not_awaited()
    assert "nuova revisione del preventivo (riferimento **PRV-2026-0009**)" in result
    assert ("che hai già ricevuto resta valido" in result) is sent_before
    assert "Vuoi che invii ora la revisione al team?" in result
    assert "€" not in result


@pytest.mark.asyncio
async def test_no_relay_claim_when_nothing_was_relayed():
    # The team took the quote during the analysis, then it changed again: nothing recorded.
    saved = DraftSaveResult(DraftSaveOutcome.WITH_THE_TEAM, "in_review", "PRV-2026-0009", 4)
    with patch("src.tools.quote_tools.ConversationRepository") as MockRepo, patch(
        "src.tools.quote_tools.get_insight_engine"
    ) as mock_get_engine, patch("src.tools.quote_tools.get_async_firestore_client"), patch(
        "src.tools.quote_tools.read_quote_status", new=AsyncMock(return_value=_status("draft"))
    ), patch("src.tools.quote_tools.relay_client_request", new=AsyncMock(return_value=None)), patch(
        "src.tools.quote_tools.gather_dossier_inputs", new=AsyncMock(return_value=DossierInputs())
    ), patch("src.tools.quote_tools.save_ai_draft", new=AsyncMock(return_value=saved)):
        _engine(mock_get_engine)
        MockRepo.return_value.get_context = AsyncMock(return_value=[
            {"role": "user", "content": "Rifai il bagno di 6 mq", "attachments": []}
        ])
        result = await suggest_quote_items_wrapper(session_id="s1", project_id="p1", user_id="u1")

    assert "segnalat" not in result
    assert "riprova" in result.lower()
    assert "Vuoi che invii" not in result
