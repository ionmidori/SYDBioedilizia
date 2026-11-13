"""ADK events for the tests of submit_quote_request's explicit-yes check."""
from unittest.mock import MagicMock

from google.adk.events import Event
from google.genai import types

TURN = "inv-now"
SEND_QUESTION = "Invio al nostro team la richiesta di preventivo per Bagno e Cucina. Confermi?"
EXPLICIT_YES = "###\nSì, confermo: invia la richiesta di preventivo al vostro team.\n###"


def text_event(author: str, text: str, invocation_id: str = "inv-before", *, thought: bool = False) -> Event:
    role = "user" if author == "user" else "model"
    return Event(
        invocation_id=invocation_id,
        author=author,
        content=types.Content(role=role, parts=[types.Part(text=text, thought=thought or None)]),
    )


def user_message(text: str) -> types.Content:
    return types.Content(role="user", parts=[types.Part(text=text)])


def give_send_consent(context: MagicMock) -> MagicMock:
    """The agent asked to send in the previous turn and the client said yes."""
    context.session.events = [text_event("user", "registra la richiesta"), text_event("quote", SEND_QUESTION)]
    context.invocation_id = TURN
    context.user_content = user_message(EXPLICIT_YES)
    return context
