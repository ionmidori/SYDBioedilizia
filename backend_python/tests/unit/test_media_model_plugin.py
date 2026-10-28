"""
MediaModelPlugin: 3.8 Flash (MODEL_VISION) only for model calls whose current
user message carries the customer's photo or video; every other call keeps
its agent's model (3.5 Flash-Lite).
"""
from types import SimpleNamespace

import pytest
from google.adk.models.llm_request import LlmRequest
from google.genai import types
from src.adk.media_model_plugin import MediaModelPlugin, has_customer_media
from src.core.config import settings


@pytest.fixture(autouse=True)
def _models(monkeypatch):
    monkeypatch.setattr(settings, "MODEL_VISION", "vision-model")
    monkeypatch.setattr(settings, "THINKING_LEVEL_VISION", "low")


def _user(*parts: types.Part) -> types.Content:
    return types.Content(role="user", parts=list(parts))


def _image() -> types.Part:
    return types.Part(inline_data=types.Blob(mime_type="image/jpeg", data=b"\xff\xd8"))


def _video() -> types.Part:
    return types.Part(file_data=types.FileData(file_uri="gs://b/v.mp4", mime_type="video/mp4"))


def _tool_result() -> types.Content:
    return types.Content(
        role="user",
        parts=[types.Part(function_response=types.FunctionResponse(name="t", response={"ok": True}))],
    )


def _request(*contents: types.Content) -> LlmRequest:
    return LlmRequest(
        model="chat-model",
        contents=list(contents),
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.MINIMAL)
        ),
    )


async def _run(request: LlmRequest) -> LlmRequest:
    await MediaModelPlugin().before_model_callback(
        callback_context=SimpleNamespace(agent_name="syd_orchestrator"), llm_request=request
    )
    return request


async def test_turn_with_uploaded_photo_uses_the_vision_model():
    request = await _run(_request(_user(types.Part(text="Ecco il bagno"), _image())))
    assert request.model == "vision-model"
    # 3.8 Flash has no "minimal": the vision thinking level replaces the agent's.
    assert request.config.thinking_config.thinking_level == types.ThinkingLevel.LOW


async def test_turn_with_uploaded_video_uses_the_vision_model():
    request = await _run(_request(_user(types.Part(text="Guarda"), _video())))
    assert request.model == "vision-model"


async def test_text_turn_keeps_the_agent_model():
    request = await _run(_request(_user(types.Part(text="Quanto costa un bagno?"))))
    assert request.model == "chat-model"
    assert request.config.thinking_config.thinking_level == types.ThinkingLevel.MINIMAL


async def test_photo_from_an_earlier_turn_does_not_switch_later_text_turns():
    request = await _run(_request(
        _user(types.Part(text="Ecco il bagno"), _image()),
        types.Content(role="model", parts=[types.Part(text="Vedo un bagno anni 80.")]),
        _user(types.Part(text="Quanto costa rifarlo?")),
    ))
    assert request.model == "chat-model"


def test_tool_results_after_the_upload_still_count_as_the_media_turn():
    # Same invocation: the model is still working on the uploaded photo.
    request = _request(_user(types.Part(text="Ecco la foto"), _image()), _tool_result())
    assert has_customer_media(request)


async def test_agents_are_registered_with_the_plugin_before_latency():
    from src.adk.adk_orchestrator import ADKOrchestrator

    orchestrator = ADKOrchestrator()
    names = [p.name for p in orchestrator.runner.app.plugins]
    assert names.index("syd_media_model") < names.index("syd_latency")


def _session_block() -> types.Content:
    """The agents' dynamic instruction as ADK sends it (static_instruction set):
    a user-role content, after the tool result on a tool continuation."""
    return _user(types.Part(text="<<instruction>>\n## CONTESTO SESSIONE (dati di sistema)\n<</instruction>>"))


async def test_tool_continuation_with_the_session_block_last_keeps_the_vision_model():
    """Phase 138 PR-5: the user message of the turn is the invocation's, not the
    session block that ADK puts after the tool result."""
    upload = _user(types.Part(text="Ecco il bagno"), _image())
    request = _request(upload, _tool_result(), _session_block())
    await MediaModelPlugin().before_model_callback(
        callback_context=SimpleNamespace(agent_name="triage", user_content=upload), llm_request=request
    )
    assert request.model == "vision-model"


async def test_text_turn_with_the_session_block_keeps_the_agent_model():
    text = _user(types.Part(text="Quanto costa?"))
    request = _request(_session_block(), text)
    await MediaModelPlugin().before_model_callback(
        callback_context=SimpleNamespace(agent_name="syd_orchestrator", user_content=text), llm_request=request
    )
    assert request.model == "chat-model"


async def test_a_refused_video_does_not_switch_to_the_vision_model():
    """VideoGuardPlugin replaced it with a placeholder: no media really goes out,
    even though the invocation's message (user_content) still carries it."""
    upload = _user(types.Part(text="Ecco il video"), _video())
    request = _request(_user(types.Part(text="Ecco il video"), types.Part(text="[Video allegato non leggibile: escluso.]")))
    await MediaModelPlugin().before_model_callback(
        callback_context=SimpleNamespace(
            agent_name="triage", user_content=upload, state={"unreadable_video_uris": ["gs://b/v.mp4"]}
        ),
        llm_request=request,
    )
    assert request.model == "chat-model"
