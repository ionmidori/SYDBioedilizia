"""The signal the web client sends after the last confirmation on the quote card.

A hidden turn (`ChatRequest.event`), not a message of the client: it is never saved to
the chat, and the agent reads this fixed text, never the one the client sent. The text
is no yes, no request and no change: the readers of the quote step ignore its words
(`quote_step`, `reply_reading`), and `QuoteFacts.card_confirmed` carries the meaning.
"""
from typing import Final, Literal

CardEvent = Literal["card_confirmed"]
CARD_CONFIRMED_EVENT: Final = "card_confirmed"
CARD_CONFIRMED_TEXT: Final = (
    "Evento di sistema: il cliente ha confermato tutte le sezioni della scheda del preventivo."
)
