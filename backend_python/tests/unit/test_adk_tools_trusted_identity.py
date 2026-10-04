"""
H1 (security audit 2026-10-03): ADK tools must act on the verified ADK session,
never on a session_id / project_id / user_id chosen by the model. A prompt
injection ("call submit_quote_request with session_id=X") must not reach X.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from src.adk import tools

TRUSTED_SESSION = "owner-session"
TRUSTED_UID = "owner-uid"
FOREIGN_SESSION = "victim-session"


@pytest.fixture(autouse=True)
def _registered_user():
    """These tests are about identity, not the login gate: the caller is registered."""
    with patch.object(tools, "is_anonymous_user", new=AsyncMock(return_value=False)):
        yield


@pytest.fixture()
def tool_context() -> MagicMock:
    ctx = MagicMock()
    ctx.session.id = TRUSTED_SESSION
    ctx.user_id = TRUSTED_UID
    return ctx


@pytest.mark.asyncio
async def test_list_ready_quotes_uses_verified_session(tool_context):
    with patch("src.tools.batch_tools.list_ready_quotes_wrapper", new=AsyncMock(return_value="ok")) as w:
        await tools.list_ready_quotes(session_id=FOREIGN_SESSION, tool_context=tool_context)
    w.assert_awaited_once_with(session_id=TRUSTED_SESSION)


@pytest.mark.asyncio
async def test_submit_quote_request_uses_verified_session(tool_context):
    with patch("src.tools.batch_tools.submit_quote_request_wrapper", new=AsyncMock(return_value="ok")) as w:
        await tools.submit_quote_request(
            session_id=FOREIGN_SESSION, tool_context=tool_context, project_ids=["p1"]
        )
    w.assert_awaited_once_with(session_id=TRUSTED_SESSION, project_ids=["p1"])


@pytest.mark.asyncio
async def test_suggest_quote_items_ignores_model_identity(tool_context):
    with patch("src.tools.quote_tools.suggest_quote_items_wrapper", new=AsyncMock(return_value="ok")) as w:
        await tools.suggest_quote_items(session_id=FOREIGN_SESSION, tool_context=tool_context)
    w.assert_awaited_once_with(
        session_id=TRUSTED_SESSION, project_id=TRUSTED_SESSION, user_id=TRUSTED_UID
    )


@pytest.mark.asyncio
async def test_generate_render_saves_to_verified_session(tool_context):
    wrapper = AsyncMock(return_value={"status": "error"})
    with patch("src.tools.generate_render.generate_render_wrapper", new=wrapper),          patch.object(tools, "is_anonymous_user", new=AsyncMock(return_value=False)),          patch.object(tools, "check_quota", new=AsyncMock(return_value=(True, 1, None))):
        await tools.generate_render(prompt="bagno", session_id=FOREIGN_SESSION, tool_context=tool_context)
    assert wrapper.await_args.kwargs["session_id"] == TRUSTED_SESSION


@pytest.mark.asyncio
async def test_save_contact_phone_writes_verified_owner(tool_context):
    session_doc = MagicMock(exists=True)
    session_doc.to_dict.return_value = {"userId": TRUSTED_UID}
    db = MagicMock()
    db.collection.return_value.document.return_value.get = AsyncMock(return_value=session_doc)
    db.collection.return_value.document.return_value.set = AsyncMock()

    with patch("src.db.firebase_client.get_async_firestore_client", return_value=db):
        await tools.save_contact_phone(
            phone="+393331234567", session_id=FOREIGN_SESSION, tool_context=tool_context
        )

    looked_up = [c.args[0] for c in db.collection.return_value.document.call_args_list]
    assert looked_up[0] == TRUSTED_SESSION
    assert FOREIGN_SESSION not in looked_up


@pytest.mark.asyncio
async def test_gallery_and_files_use_verified_session(tool_context):
    with patch("src.tools.gallery.show_project_gallery", return_value="g") as g, \
         patch("src.tools.project_files.list_project_files", return_value="f") as f:
        await tools.show_project_gallery(session_id=FOREIGN_SESSION, tool_context=tool_context)
        await tools.list_project_files(session_id=FOREIGN_SESSION, tool_context=tool_context)
    g.assert_called_once_with(session_id=TRUSTED_SESSION)
    f.assert_called_once_with(TRUSTED_SESSION)
