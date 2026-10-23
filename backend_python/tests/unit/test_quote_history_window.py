"""The quote reads a long conversation (several rooms) but sends the model only
the most recent photos: every photo is downloaded and sent inline."""
from unittest.mock import AsyncMock, patch

from src.services.insight_engine import InsightAnalysis
from src.tools.quote_tools import _QUOTE_HISTORY_MESSAGES, _QUOTE_MEDIA_MAX, suggest_quote_items_wrapper


async def test_quote_reads_a_wide_window_and_sends_only_the_latest_photos():
    history = [
        {"role": "user", "content": f"stanza {i}", "attachments": {"images": [f"https://example.com/p{i}.jpg"]}}
        for i in range(12)
    ]
    with patch("src.tools.quote_tools.ConversationRepository") as repo, \
         patch("src.tools.quote_tools.get_insight_engine") as get_engine:
        repo.return_value.get_context = AsyncMock(return_value=history)
        analyze = AsyncMock(return_value=InsightAnalysis(suggestions=[], summary="Più stanze."))
        get_engine.return_value.analyze_project_for_quote = analyze

        await suggest_quote_items_wrapper(session_id="s1", project_id="p1", user_id="u1")

    assert repo.return_value.get_context.await_args.kwargs["limit"] == _QUOTE_HISTORY_MESSAGES == 150
    sent = analyze.await_args.args[1]
    assert sent == [f"https://example.com/p{i}.jpg" for i in range(12 - _QUOTE_MEDIA_MAX, 12)]
