"""A render of a room the user photographed must start from that photo (I2I).

Production, 11 Oct 2026 (session 9de20502…): the kitchen photo was attached to the
first message; 14 turns later "fai anche un render… tinteggiatura beige sabbia"
was generated text-only (log "Generating T2I image"), because the photo URL was
only in the upload turn and the model no longer passed it. The tool now finds
the photo itself in the project files."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from google.api_core.exceptions import GoogleAPIError
from src.adk import tools
from src.db.projects import media
from src.tools.quota import QuotaDecision
from src.utils.datetime_utils import utc_now

SESSION = "sess-1"
PHOTO = "https://storage.googleapis.com/bucket/user-uploads/sess-1/kitchen.jpg?X-Goog-Signature=x"
OK = {"status": "success", "imageUrl": "https://storage.googleapis.com/bucket/renders/sess-1/r.png"}


@pytest.fixture()
def tool_context() -> MagicMock:
    ctx = MagicMock()
    ctx.session.id = SESSION
    ctx.user_id = "uid-1"
    ctx.state = {}
    ctx.save_artifact = AsyncMock(return_value=0)
    return ctx


@pytest.fixture()
def wrapper():
    w = AsyncMock(return_value=OK)
    with patch("src.tools.generate_render.generate_render_wrapper", new=w), \
         patch.object(tools, "is_anonymous_user", new=AsyncMock(return_value=False)), \
         patch.object(tools, "check_quota", new=AsyncMock(return_value=QuotaDecision(True, 1, utc_now()))), \
         patch.object(tools, "increment_quota", new=AsyncMock()):
        yield w


def _session_photo(url: str | None):
    return patch.object(tools, "latest_uploaded_photo_url", new=AsyncMock(return_value=url))


async def test_uses_the_project_photo_when_the_model_forgot_it(wrapper, tool_context):
    with _session_photo(PHOTO):
        await tools.generate_render(prompt="beige walls", session_id=SESSION, tool_context=tool_context)
    kwargs = wrapper.await_args.kwargs
    assert kwargs["mode"] == "modification"
    assert kwargs["source_image_url"] == PHOTO


async def test_creation_mode_is_overridden_when_a_photo_exists(wrapper, tool_context):
    with _session_photo(PHOTO):
        await tools.generate_render(
            prompt="beige walls", session_id=SESSION, tool_context=tool_context, mode="creation"
        )
    assert wrapper.await_args.kwargs["mode"] == "modification"


async def test_explicit_from_scratch_request_skips_the_photo(wrapper, tool_context):
    lookup = AsyncMock(return_value=PHOTO)
    with patch.object(tools, "latest_uploaded_photo_url", new=lookup):
        await tools.generate_render(
            prompt="new kitchen", session_id=SESSION, tool_context=tool_context,
            ignore_uploaded_photo=True,
        )
    assert wrapper.await_args.kwargs["mode"] == "creation"
    assert wrapper.await_args.kwargs["source_image_url"] is None
    lookup.assert_not_awaited()


async def test_no_photo_means_text_to_image(wrapper, tool_context):
    with _session_photo(None):
        await tools.generate_render(prompt="new kitchen", session_id=SESSION, tool_context=tool_context)
    assert wrapper.await_args.kwargs["mode"] == "creation"
    assert wrapper.await_args.kwargs["source_image_url"] is None


async def test_url_passed_by_the_model_wins(wrapper, tool_context):
    lookup = AsyncMock(return_value="https://other")
    with patch.object(tools, "latest_uploaded_photo_url", new=lookup):
        await tools.generate_render(
            prompt="x", session_id=SESSION, tool_context=tool_context, source_image_url=PHOTO
        )
    assert wrapper.await_args.kwargs == wrapper.await_args.kwargs | {
        "mode": "modification", "source_image_url": PHOTO,
    }
    lookup.assert_not_awaited()


async def test_one_render_per_turn(wrapper, tool_context):
    """A second call in the same turn returns the first render instead of a new image."""
    with _session_photo(None):
        first = await tools.generate_render(prompt="x", session_id=SESSION, tool_context=tool_context)
        second = await tools.generate_render(prompt="x", session_id=SESSION, tool_context=tool_context)
    assert wrapper.await_count == 1
    assert second["imageUrl"] == first["imageUrl"]


async def test_a_later_turn_renders_again(wrapper, tool_context):
    with _session_photo(None):
        await tools.generate_render(prompt="x", session_id=SESSION, tool_context=tool_context)
        tool_context.invocation_id = "next-turn"
        await tools.generate_render(prompt="y", session_id=SESSION, tool_context=tool_context)
    assert wrapper.await_count == 2


async def test_photo_lookup_failure_falls_back_to_text(wrapper, tool_context):
    failing = AsyncMock(side_effect=GoogleAPIError("firestore down"))
    with patch.object(tools, "latest_uploaded_photo_url", new=failing):
        result = await tools.generate_render(prompt="x", session_id=SESSION, tool_context=tool_context)
    assert result == OK
    assert wrapper.await_args.kwargs["mode"] == "creation"


# ── latest_uploaded_photo_url ───────────────────────────────────────────────

def _files_db(files: list[dict]) -> MagicMock:
    async def stream():
        for f in files:
            doc = MagicMock()
            doc.to_dict.return_value = f
            yield doc

    db = MagicMock()
    files_ref = db.collection.return_value.document.return_value.collection.return_value
    files_ref.order_by.return_value.stream = stream
    return db


async def test_latest_photo_skips_renders_and_videos():
    db = _files_db([  # already newest first (order_by uploadedAt DESC)
        {"type": "render", "url": "https://render"},
        {"type": "video", "url": "https://video"},
        {"type": "image", "url": PHOTO},
        {"type": "image", "url": "https://older"},
    ])
    with patch.object(media, "get_async_firestore_client", return_value=db):
        assert await media.latest_uploaded_photo_url(SESSION) == PHOTO


async def test_latest_photo_none_without_images():
    with patch.object(media, "get_async_firestore_client", return_value=_files_db([{"type": "render", "url": "r"}])):
        assert await media.latest_uploaded_photo_url(SESSION) is None
