"""
Chat-side quote submission tools (ADK wrappers implementation).

Gives the AI a way to submit quote requests to the admin REUSING the same
batch pipeline as the dashboard button (batch_service.create_batch/submit_batch)
— a single submission path for both UI and chat.

Returns user-facing Italian strings (ADK tool convention).
"""
from __future__ import annotations

import logging

from src.core.exceptions import NoEligibleProjectsError
from src.db.firebase_client import get_async_firestore_client
from src.db.projects import get_user_projects
from src.services import batch_service

logger = logging.getLogger(__name__)

_LOGIN_REQUIRED_MSG = (
    "Per inviare la richiesta di preventivo devi prima accedere al tuo account. "
    "Usa il pulsante di login."
)


async def _resolve_user_id(session_id: str) -> str | None:
    """Resolve the authenticated user's uid from sessions/{session_id}.userId."""
    db = get_async_firestore_client()
    session_doc = await db.collection("sessions").document(session_id).get()
    if not session_doc.exists:
        return None
    return (session_doc.to_dict() or {}).get("userId")


async def _get_ready_quotes(user_id: str) -> list[dict]:
    """
    List the user's projects that have a submittable draft quote
    (projects/{id}/private_data/quote with status=='draft' and items>0).
    """
    db = get_async_firestore_client()
    ready: list[dict] = []
    for project in await get_user_projects(user_id):
        pid = project.session_id  # project_id == session_id
        quote_doc = await (
            db.collection("projects").document(pid)
            .collection("private_data").document("quote").get()
        )
        if not quote_doc.exists:
            continue
        qdata = quote_doc.to_dict() or {}
        items = qdata.get("items", [])
        if qdata.get("status") != "draft" or not items:
            continue
        financials = qdata.get("financials", {})
        ready.append({
            "project_id": pid,
            "title": project.title,
            "item_count": len(items),
            "grand_total": financials.get("grand_total", financials.get("subtotal", 0.0)),
        })
    return ready


async def list_ready_quotes_wrapper(session_id: str) -> str:
    """List the user's projects with a draft quote ready to be submitted."""
    try:
        user_id = await _resolve_user_id(session_id)
        if not user_id:
            return _LOGIN_REQUIRED_MSG

        ready = await _get_ready_quotes(user_id)
        if not ready:
            return (
                "Non ci sono preventivi in bozza pronti per l'invio. "
                "Completa prima un preventivo in chat (le voci vengono salvate come bozza)."
            )

        lines = ["Preventivi pronti per l'invio al team:"]
        for i, r in enumerate(ready, start=1):
            lines.append(
                f"{i}. **{r['title']}** — {r['item_count']} voci, "
                f"€{r['grand_total']:,.2f} (ID: {r['project_id']})"
            )
        lines.append(
            "Chiedi al cliente QUALI progetti inviare e attendi la sua CONFERMA "
            "esplicita prima di chiamare submit_quote_request."
        )
        return "\n".join(lines)
    except Exception:
        logger.error("[list_ready_quotes] Failed.", exc_info=True)
        return "Non riesco a recuperare l'elenco dei preventivi in questo momento. Riprova tra poco."


async def submit_quote_request_wrapper(
    session_id: str,
    project_ids: list[str] | None = None,
) -> str:
    """Create+submit a quote batch for the given projects (default: current session)."""
    try:
        user_id = await _resolve_user_id(session_id)
        if not user_id:
            return _LOGIN_REQUIRED_MSG

        target_ids = [pid for pid in (project_ids or []) if pid] or [session_id]

        try:
            summary = await batch_service.create_batch(
                user_id=user_id, project_ids=target_ids,
            )
        except NoEligibleProjectsError:
            return (
                "Nessuno dei progetti indicati ha un preventivo in bozza da inviare. "
                "Usa list_ready_quotes per vedere quelli pronti."
            )

        submitted = await batch_service.submit_batch(
            user_id=user_id, batch_id=summary.batch_id,
        )

        n = submitted.total_projects
        progetti = "progetto" if n == 1 else "progetti"
        return (
            f"✅ Richiesta di preventivo inviata! {n} {progetti} "
            f"(subtotale €{submitted.batch_subtotal:,.2f}). "
            f"Il nostro team è stato avvisato: riceverai il preventivo finale "
            f"via email dopo la revisione."
        )
    except Exception:
        logger.error("[submit_quote_request] Failed.", exc_info=True)
        return (
            "Si è verificato un problema durante l'invio della richiesta. "
            "Riprova tra poco oppure usa la dashboard progetti."
        )
