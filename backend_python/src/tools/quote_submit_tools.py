"""
Chat-side quote submission (ADK wrapper implementation).

Sends the CURRENT project's quote to the team through the same service as the
dashboard "Invia al team" button (services/quote_submission.py) — a single
submission path for both UI and chat. One chat = one project, with a section
per room: there is nothing to choose, only to confirm.

Returns user-facing Italian strings (ADK tool convention).
"""
from __future__ import annotations

import logging

from google.api_core.exceptions import GoogleAPIError
from src.core.exceptions import (
    AppException,
    EmptyQuoteError,
    InvalidQuoteTransitionError,
    PermissionDenied,
    QuoteNotFoundError,
    ResourceNotFound,
)
from src.services.quote_submission import submit_project_quote

logger = logging.getLogger(__name__)

# Every failure starts with this marker, every success with "✅": the agent
# prompt (MODE_B_SURVEYOR STEP 3) reports the REAL outcome from it. Before, the
# prompt told the agent to always say "Richiesta inviata! ✅" after the call,
# so a failed submission was announced to the client as sent.
NOT_SENT_PREFIX = "❌ RICHIESTA NON INVIATA:"

_LOGIN_REQUIRED_MSG = (
    f"{NOT_SENT_PREFIX} per inviare la richiesta di preventivo devi prima accedere "
    "al tuo account. Usa il pulsante di login."
)


async def submit_quote_request_wrapper(session_id: str, user_id: str) -> str:
    """Submit the quote of the session's project (project_id == session_id).

    `session_id` and `user_id` come from the verified ADK session (the caller
    already refused guests); the service checks that the user owns the project.
    """
    if not user_id:
        return _LOGIN_REQUIRED_MSG
    try:
        result = await submit_project_quote(user_id, session_id)
    except (QuoteNotFoundError, EmptyQuoteError):
        return (
            f"{NOT_SENT_PREFIX} in questo progetto non c'è ancora un preventivo da inviare. "
            "Prepara prima la richiesta con suggest_quote_items."
        )
    except (ResourceNotFound, PermissionDenied):
        return f"{NOT_SENT_PREFIX} non trovo il progetto di questa chat nel tuo account."
    except InvalidQuoteTransitionError:
        return (
            f"{NOT_SENT_PREFIX} il preventivo di questo progetto non può essere inviato nello "
            "stato attuale (per esempio è stato chiuso dal nostro team). Scrivici e lo verifichiamo."
        )
    # Firestore down, transaction retries exhausted (ValueError), any other domain
    # error: the agent must still read "not sent", never a broken turn.
    except (GoogleAPIError, ValueError, AppException):
        logger.error("[submit_quote_request] Failed.", exc_info=True)
        return (
            f"{NOT_SENT_PREFIX} si è verificato un problema durante l'invio. "
            "Riprova tra poco oppure usa il pulsante \"Invia al team\" nella pagina del progetto."
        )

    reference = f" (riferimento {result.quote_number})" if result.quote_number else ""
    if result.duplicate:
        return (
            f"✅ La richiesta di preventivo{reference} era già stata inviata: il nostro team "
            "la sta esaminando e riceverai il preventivo finale via email dopo la revisione."
        )
    return (
        f"✅ Richiesta di preventivo inviata{reference}. Il nostro team è stato avvisato: "
        "riceverai il preventivo finale via email dopo la revisione."
    )
