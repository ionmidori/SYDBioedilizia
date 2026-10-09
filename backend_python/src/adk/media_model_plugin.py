"""
ADK plugin: model calls that analyze the customer's uploaded photos/videos use
the vision model (MODEL_VISION); every other call keeps its agent's model.

The choice depends on the turn, not on the agent: an upload can reach the
router (intent question, it describes what it sees), `triage` (analysis) or
`design` (render from the photo). The plugin inspects the current user message
of each model request and, when it carries an image or video, swaps the model
and the thinking level (the vision model may not support the agent's level,
e.g. 3.8 Flash has no "minimal").

Registered before LatencyPlugin, so timing logs show the model actually used.
"""
from __future__ import annotations

from google.adk.agents.callback_context import CallbackContext
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.adk.plugins.base_plugin import BasePlugin
from google.genai import types

from src.core.models import ModelRole, build_thinking_config, get_model_id

_MEDIA_PREFIXES = ("image/", "video/")


def _is_customer_media(part: types.Part) -> bool:
    blob = part.inline_data or part.file_data
    mime = (blob.mime_type or "") if blob is not None else ""
    return mime.startswith(_MEDIA_PREFIXES)


def current_user_message(contents: list[types.Content]) -> types.Content | None:
    """Latest user message of the request, skipping tool results (which ADK
    also sends with role "user") and model turns."""
    for content in reversed(contents):
        if content.role != "user" or not content.parts:
            continue
        if all(p.function_response is not None for p in content.parts):
            continue
        return content
    return None


def has_customer_media(llm_request: LlmRequest) -> bool:
    message = current_user_message(llm_request.contents)
    return message is not None and any(_is_customer_media(p) for p in message.parts or [])


class MediaModelPlugin(BasePlugin):
    def __init__(self) -> None:
        super().__init__(name="syd_media_model")

    async def before_model_callback(
        self, *, callback_context: CallbackContext, llm_request: LlmRequest
    ) -> LlmResponse | None:
        if not has_customer_media(llm_request):
            return None
        llm_request.model = get_model_id(ModelRole.VISION)
        if llm_request.config is None:
            llm_request.config = types.GenerateContentConfig()
        llm_request.config.thinking_config = build_thinking_config(ModelRole.VISION)
        return None
