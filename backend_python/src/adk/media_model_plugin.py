"""
ADK plugin: model calls that analyze the customer's uploaded photos/videos use
the vision model (MODEL_VISION); every other call keeps its agent's model.

The choice depends on the turn, not on the agent: an upload can reach the
router (intent question, it describes what it sees), `triage` (analysis) or
`design` (render from the photo). The plugin inspects the user message of the
turn and, when it carries an image or video, swaps the model and the thinking
level (the vision model may not support the agent's level, e.g. 3.8 Flash has
no "minimal").

The user message of the turn is the content that started the invocation
(`user_content`), not "the last user content of the request": with the prompts
in `static_instruction` ADK sends the session block as a user-role content,
after the tool result when the model continues a tool call (Phase 138 PR-5).

Registered before LatencyPlugin, so timing logs show the model actually used.
"""
from __future__ import annotations

from google.adk.agents.callback_context import CallbackContext
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.adk.plugins.base_plugin import BasePlugin
from google.genai import types

from src.adk.video_attachments import UNREADABLE_VIDEOS_STATE_KEY
from src.core.models import ModelRole, build_thinking_config, get_model_id

_MEDIA_PREFIXES = ("image/", "video/")


def _is_customer_media(part: types.Part, refused: frozenset[str] = frozenset()) -> bool:
    """An image or video the model will receive. A video the model refused is
    not: VideoGuardPlugin sends a placeholder in its place."""
    if part.file_data is not None and part.file_data.file_uri in refused:
        return False
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


def turn_user_message(callback_context: object, llm_request: LlmRequest) -> types.Content | None:
    """The user message of this turn: the content that started the invocation,
    else (no invocation context) the latest user message of the request."""
    content = getattr(callback_context, "user_content", None)
    if isinstance(content, types.Content):
        return content
    return current_user_message(llm_request.contents)


def has_customer_media(llm_request: LlmRequest, callback_context: object = None) -> bool:
    message = turn_user_message(callback_context, llm_request)
    if message is None:
        return False
    # `user_content` is the message as sent, before VideoGuardPlugin: skip what it removed.
    state = getattr(callback_context, "state", None)
    refused = frozenset((state.get(UNREADABLE_VIDEOS_STATE_KEY) or ()) if state is not None else ())
    return any(_is_customer_media(p, refused) for p in message.parts or [])


class MediaModelPlugin(BasePlugin):
    def __init__(self) -> None:
        super().__init__(name="syd_media_model")

    async def before_model_callback(
        self, *, callback_context: CallbackContext, llm_request: LlmRequest
    ) -> LlmResponse | None:
        if not has_customer_media(llm_request, callback_context):
            return None
        llm_request.model = get_model_id(ModelRole.VISION)
        if llm_request.config is None:
            llm_request.config = types.GenerateContentConfig()
        llm_request.config.thinking_config = build_thinking_config(ModelRole.VISION)
        return None
