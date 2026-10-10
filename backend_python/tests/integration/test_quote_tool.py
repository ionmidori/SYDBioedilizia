from unittest.mock import AsyncMock, patch

import pytest
from src.services.insight_engine import InsightAnalysis, SKUItemSuggestion
from src.services.quote_dossier import DossierInputs
from src.services.quote_drafts import DraftSaveOutcome, DraftSaveResult
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
                "src.tools.quote_tools.gather_dossier_inputs", new=AsyncMock(return_value=DossierInputs())
            ), patch(
                "src.tools.quote_tools.save_ai_draft",
                new=AsyncMock(
                    return_value=DraftSaveResult(DraftSaveOutcome.CREATED, "draft", "PRV-2026-0001")
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


@pytest.mark.asyncio
async def test_suggest_quote_items_does_not_touch_a_quote_under_review():
    with patch("src.tools.quote_tools.ConversationRepository") as MockRepo:
        MockRepo.return_value.get_context = AsyncMock(return_value=[
            {"role": "user", "content": "Rifai il bagno di 6 mq", "attachments": []}
        ])
        with patch("src.tools.quote_tools.get_insight_engine") as mock_get_engine:
            mock_get_engine.return_value.analyze_project_for_quote = AsyncMock(return_value=InsightAnalysis(
                suggestions=[SKUItemSuggestion(sku="DEM-001", qty=6.0, ai_reasoning="Demolizione")],
                summary="Rifacimento bagno.",
            ))
            with patch("src.tools.quote_tools.get_async_firestore_client"), patch(
                "src.tools.quote_tools.gather_dossier_inputs", new=AsyncMock(return_value=DossierInputs())
            ), patch(
                "src.tools.quote_tools.save_ai_draft",
                new=AsyncMock(
                    return_value=DraftSaveResult(DraftSaveOutcome.SKIPPED, "pending_review", "PRV-2026-0009")
                ),
            ):
                result = await suggest_quote_items_wrapper(session_id="s1", project_id="p1", user_id="u1")

    assert "PRV-2026-0009" in result
    assert "già in mano al nostro team" in result
    assert "Vuoi che invii" not in result
