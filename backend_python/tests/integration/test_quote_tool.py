import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from src.tools.quote_tools import suggest_quote_items_wrapper
from src.services.insight_engine import InsightAnalysis, SKUItemSuggestion

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

            # Mock Firestore
            with patch("src.tools.quote_tools.get_async_firestore_client") as mock_get_db:
                mock_db = mock_get_db.return_value
                mock_col = mock_db.collection.return_value
                mock_doc = mock_col.document.return_value
                mock_subcol = mock_doc.collection.return_value
                mock_subdoc = mock_subcol.document.return_value
                mock_subdoc.set = AsyncMock()

                # Execute
                result = await suggest_quote_items_wrapper(
                    session_id="test_session",
                    project_id="test_project",
                    user_id="test_user"
                )

                # Verify
                assert "Renovation of living room floor" in result
                assert "DEM-001" in result
                assert "PAV-001" in result
                assert "Estimated Subtotal" in result
                
                # Check Firestore call
                # projects/{projectId}/private_data/quote
                # db.collection('projects').document('test_project').collection('private_data').document('quote').set(...)
                mock_db.collection.assert_called_with('projects')
                mock_col.document.assert_called_with('test_project')
                mock_doc.collection.assert_called_with('private_data')
                mock_subcol.document.assert_called_with('quote')
                mock_subdoc.set.assert_called_once()
                
                call_args = mock_subdoc.set.call_args[0][0]
                assert call_args["items"][0]["sku"] == "DEM-001"
                assert call_args["financials"]["grand_total"] > 0
