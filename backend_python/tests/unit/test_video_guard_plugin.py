"""VideoGuardPlugin: a video the model refused never reaches it again.

ADK stores the user message (with its `file_data` part) in the session before the
model call, so without this guard every later turn would resend the broken video
and fail the same way.
"""
from types import SimpleNamespace

from google.adk.models.llm_request import LlmRequest
from google.genai import types
from src.adk.video_attachments import UNREADABLE_VIDEOS_STATE_KEY
from src.adk.video_guard_plugin import VideoGuardPlugin

BAD = "gs://b/user-uploads/s1/bad.mp4"
GOOD = "gs://b/user-uploads/s1/good.mp4"


def _video(uri: str) -> types.Part:
    return types.Part(file_data=types.FileData(file_uri=uri, mime_type="video/mp4"))


def _request(*contents: types.Content) -> LlmRequest:
    return LlmRequest(model="m", contents=list(contents))


def _context(unreadable: list[str] | None) -> SimpleNamespace:
    state = {} if unreadable is None else {UNREADABLE_VIDEOS_STATE_KEY: unreadable}
    return SimpleNamespace(state=state)


async def _guard(request: LlmRequest, unreadable: list[str] | None) -> object:
    return await VideoGuardPlugin().before_model_callback(callback_context=_context(unreadable), llm_request=request)


async def test_refused_video_is_replaced_by_a_text_placeholder_in_every_turn():
    request = _request(
        types.Content(role="user", parts=[types.Part(text="guarda"), _video(BAD)]),
        types.Content(role="model", parts=[types.Part(text="...")]),
        types.Content(role="user", parts=[types.Part(text="e quindi?")]),
    )

    assert await _guard(request, [BAD]) is None  # never short-circuits the model call

    first = request.contents[0].parts
    assert first[0].text == "guarda"
    assert first[1].file_data is None
    assert "non leggibile" in (first[1].text or "")


async def test_other_videos_and_parts_are_untouched():
    good = _video(GOOD)
    request = _request(types.Content(role="user", parts=[_video(BAD), good]))

    await _guard(request, [BAD])

    assert request.contents[0].parts[1] is good


async def test_without_refused_videos_the_request_is_unchanged():
    contents = [types.Content(role="user", parts=[_video(BAD)])]
    request = _request(*contents)

    await _guard(request, None)
    await _guard(request, [])

    assert request.contents[0].parts[0].file_data.file_uri == BAD


async def test_contents_without_parts_are_tolerated():
    request = _request(types.Content(role="user", parts=None), types.Content(role="model", parts=[]))

    assert await _guard(request, [BAD]) is None
