"""ADK events for the tests that read a turn from the session (quote step, gate, plugin)."""
from google.adk.events import Event
from google.genai import types

TURN = "inv-now"


def text_event(author: str, text: str, invocation_id: str = "inv-before", *, thought: bool = False) -> Event:
    role = "user" if author == "user" else "model"
    return Event(
        invocation_id=invocation_id,
        author=author,
        content=types.Content(role=role, parts=[types.Part(text=text, thought=thought or None)]),
    )


def user_message(text: str) -> types.Content:
    return types.Content(role="user", parts=[types.Part(text=text)])
