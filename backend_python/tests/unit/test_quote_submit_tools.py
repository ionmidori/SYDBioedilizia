"""
Chat quote-submission tool — Phase 138 PR-4.

submit_quote_request_wrapper (src/tools/quote_submit_tools.py): the verified
uid from the ADK session, always the current project (project_id ==
session_id), "✅" on success, "❌ RICHIESTA NON INVIATA" on every failure —
also on an unexpected one, so the agent never reports a broken turn as sent.
"""
from unittest.mock import AsyncMock, patch

import pytest
from google.api_core.exceptions import ServiceUnavailable
from src.core.exceptions import (
    AppException,
    EmptyQuoteError,
    InvalidQuoteTransitionError,
    PermissionDenied,
    QuoteNotFoundError,
    ResourceNotFound,
)
from src.services.quote_submission import SubmissionResult
from src.tools.quote_submit_tools import NOT_SENT_PREFIX, submit_quote_request_wrapper

USER = "client-uid-123"
SESSION = "session-abc"
MODULE = "src.tools.quote_submit_tools"


async def _run(user_id: str, submit: AsyncMock) -> str:
    with patch(f"{MODULE}.submit_project_quote", submit):
        return await submit_quote_request_wrapper(SESSION, user_id)


async def test_a_session_without_user_gets_login_message():
    submit = AsyncMock()
    result = await _run("", submit)
    assert result.startswith(NOT_SENT_PREFIX)
    assert "accedere" in result
    submit.assert_not_awaited()


async def test_submits_the_current_project():
    submit = AsyncMock(return_value=SubmissionResult(SESSION, "pending_review", "PRV-2026-0042", duplicate=False))
    result = await _run(USER, submit)
    assert result.startswith("✅")
    assert "PRV-2026-0042" in result and "inviata" in result
    submit.assert_awaited_once_with(USER, SESSION)


async def test_a_quote_already_with_the_team_is_reported_as_such():
    submit = AsyncMock(return_value=SubmissionResult(SESSION, "in_review", None, duplicate=True))
    result = await _run(USER, submit)
    assert result.startswith("✅")
    assert "era già stata inviata" in result


@pytest.mark.parametrize(
    ("error", "reason"),
    [
        (QuoteNotFoundError(SESSION), "non c'è ancora un preventivo"),
        (EmptyQuoteError(SESSION), "non c'è ancora un preventivo"),
        (ResourceNotFound(message="missing"), "non trovo il progetto"),
        (PermissionDenied(message="no"), "non trovo il progetto"),
        (InvalidQuoteTransitionError("rejected", "submit"), "stato attuale"),
        (ServiceUnavailable("down"), "problema"),
        (ValueError("transaction retries exhausted"), "problema"),
        (AppException(message="unexpected"), "problema"),
    ],
)
async def test_every_failure_is_reported_as_not_sent(error, reason):
    result = await _run(USER, AsyncMock(side_effect=error))
    assert result.startswith(NOT_SENT_PREFIX)  # the prompt keys on this marker
    assert reason in result
    assert "✅" not in result
