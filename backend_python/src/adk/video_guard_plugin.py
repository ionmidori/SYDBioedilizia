"""
ADK plugin: a video the model refused is never sent to it again.

ADK appends the user message — with its `file_data` part — to the session before
calling the model. When Vertex refuses that video (corrupt file, unsupported
codec), the orchestrator retries the turn without it and records the URI in the
session state (`video_attachments.UNREADABLE_VIDEOS_STATE_KEY`). Without this
plugin every later request would still carry the broken part from history and
fail the same way: the session would be stuck.

Registered first, so MediaModelPlugin sees only the media that is really sent.
"""
from __future__ import annotations

from google.adk.agents.callback_context import CallbackContext
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.adk.plugins.base_plugin import BasePlugin
from google.genai import types

from src.adk.video_attachments import UNREADABLE_VIDEOS_STATE_KEY

_PLACEHOLDER = "[Video allegato non leggibile: escluso.]"


class VideoGuardPlugin(BasePlugin):
    def __init__(self) -> None:
        super().__init__(name="syd_video_guard")

    async def before_model_callback(
        self, *, callback_context: CallbackContext, llm_request: LlmRequest
    ) -> LlmResponse | None:
        unreadable = set(callback_context.state.get(UNREADABLE_VIDEOS_STATE_KEY) or ())
        if not unreadable:
            return None
        for content in llm_request.contents:
            if not content.parts:
                continue
            content.parts = [
                types.Part(text=_PLACEHOLDER)
                if part.file_data is not None and part.file_data.file_uri in unreadable
                else part
                for part in content.parts
            ]
        return None
