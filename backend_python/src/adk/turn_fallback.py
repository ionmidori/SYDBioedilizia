"""The reply a turn keeps when the model fails after a tool already acted.

A quote sent by `submit_quote_request` is sent whatever the model does next: if
the model then times out, the client reads the tool's confirmation, never an
error that reads as "nothing happened" (test chat of 18/11).
"""
from __future__ import annotations

import httpx
from google.genai import errors as genai_errors

from src.tools.quote_submit_tools import SENT_MARK

SUBMIT_TOOL = "submit_quote_request"
# The failures of the model call (Vertex error, timeout, network): a bug in our code
# or a guardrail failure is none of them and keeps the error and its trace.
MODEL_FAILURES: tuple[type[Exception], ...] = (genai_errors.APIError, httpx.HTTPError)


def confirmed_since_send(text_after_send: str) -> bool:
    """The model already announced the send (no second confirmation below it)."""
    return SENT_MARK in text_after_send


def sent_reply(name: str | None, response: object) -> str | None:
    """The confirmation of a successful send (None: another tool, or not sent).
    ADK wraps a str result as {"result": ...}."""
    if name != SUBMIT_TOOL:
        return None
    text = response.get("result") if isinstance(response, dict) else response
    return text if isinstance(text, str) and text.startswith(SENT_MARK) else None
