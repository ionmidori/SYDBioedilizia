"""
ADK plugin: per-session facts (login state, phone on file, session id) reach the
model as a system-instruction block, not as text inside the user message.

The orchestrator writes them into the session state on every turn
(`session_context_delta`, passed as `state_delta` to `run_async`); this plugin
appends the "CONTESTO SESSIONE" block to each model request. Kept out of the user
message they are neither repeated in the history at every turn nor mixed with
what the user typed. The block keeps the markers the prompts look for
("OSPITE ANONIMO", "PHONE_ON_FILE: true", SESSION_ID).

The prompt is not the control: premium tools re-check login server side
(`tools._is_guest`) and ignore the model's session id (`tools._trusted_session_id`).
"""
from __future__ import annotations

from typing import Any

from google.adk.agents.callback_context import CallbackContext
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.adk.plugins.base_plugin import BasePlugin

SESSION_CONTEXT_STATE_KEY = "syd_session_context"

_GUEST_RULE = (
    "STATO AUTENTICAZIONE: L'utente è un OSPITE ANONIMO. "
    "REGOLA ASSOLUTA: Prima di chiamare generate_render, suggest_quote_items, pricing_engine, "
    "search_listino, search_prezzario, retrieve_price_by_code o qualsiasi tool premium, "
    "DEVI OBBLIGATORIAMENTE chiamare request_login_adk. "
    "NON chiamare MAI generate_render per un utente OSPITE. "
    "Questo vale per rendering 3D, preventivi, salvataggi e qualsiasi azione premium. "
    "Sequenza corretta: 1) chiama request_login_adk, 2) rispondi all'utente che deve autenticarsi."
)
_LOGGED_IN_RULE = (
    "STATO AUTENTICAZIONE: L'utente è GIA' LOGGATO con un account verificato. "
    "NON DEVI MAI USARE il tool request_login_adk per nessun motivo."
)


def session_context_delta(*, is_guest: bool, phone_on_file: bool, session_id: str) -> dict[str, Any]:
    """State delta carrying this turn's session facts."""
    return {
        SESSION_CONTEXT_STATE_KEY: {
            "is_guest": is_guest,
            "phone_on_file": phone_on_file,
            "session_id": session_id,
        }
    }


def session_context_block(context: dict[str, Any]) -> str:
    return (
        "## CONTESTO SESSIONE (dati di sistema, aggiornati a ogni turno)\n"
        f"{_GUEST_RULE if context.get('is_guest', True) else _LOGGED_IN_RULE}\n"
        f"SESSION_ID: {context.get('session_id', '')}\n"
        f"PHONE_ON_FILE: {'true' if context.get('phone_on_file') else 'false'}"
    )


class SessionContextPlugin(BasePlugin):
    def __init__(self) -> None:
        super().__init__(name="syd_session_context")

    async def before_model_callback(
        self, *, callback_context: CallbackContext, llm_request: LlmRequest
    ) -> LlmResponse | None:
        context = callback_context.state.get(SESSION_CONTEXT_STATE_KEY)
        if context:
            llm_request.append_instructions([session_context_block(context)])
        return None
