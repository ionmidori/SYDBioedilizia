"""The signals the web client sends by itself from the quote card.

- `card_confirmed`: after the last confirmation on the card;
- `quote_sent`: after the "Invia al team" button of the card sent the request (the
  click is the consent: only the button sends, never the chat).

A hidden turn (`ChatRequest.event`), not a message of the client: it is never saved to
the chat, and the agent reads the fixed text of the signal, never the one the client
sent. The text is no yes, no request and no change: the readers of the quote step
ignore its words (`quote_step`, `reply_reading`), and `QuoteFacts.card_confirmed` /
`QuoteFacts.quote_sent` carry the meaning.
"""
from typing import Final, Literal

CardEvent = Literal["card_confirmed", "quote_sent"]
CARD_CONFIRMED_EVENT: Final = "card_confirmed"
QUOTE_SENT_EVENT: Final = "quote_sent"
CARD_CONFIRMED_TEXT: Final = (
    "Evento di sistema: il cliente ha confermato tutte le sezioni della scheda del preventivo."
)
QUOTE_SENT_TEXT: Final = (
    "Evento di sistema: il cliente ha inviato la richiesta di preventivo al team con il pulsante della scheda."
)
# The fixed text the agent reads for each signal.
CARD_EVENT_TEXTS: Final[dict[str, str]] = {
    CARD_CONFIRMED_EVENT: CARD_CONFIRMED_TEXT,
    QUOTE_SENT_EVENT: QUOTE_SENT_TEXT,
}
