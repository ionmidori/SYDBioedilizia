"""
ADK Tools Registration.
Defines typed async functions for Vertex Agent Engine tools.

ADK 1.26 convention: pass the function directly to FunctionTool(func).
Name comes from the function name; description from the docstring.
Type hints on parameters define the input schema.
Pydantic validation is enforced via the function's argument types.
"""
import asyncio
import logging
import re
from typing import Any

from google.adk.tools import FunctionTool
from google.api_core.exceptions import GoogleAPIError
from pydantic import ValidationError

from src.adk.session_context import ACTIVE_ROOM_STATE_KEY, ROOMS_STATE_KEY, room_index_entry
from src.auth.user_lookup import is_anonymous_user
from src.core.config import settings
from src.core.money import line_total, to_json_number
from src.core.telemetry import instrumented_tool
from src.db.projects.media import latest_uploaded_photo_url
from src.repositories.room_repository import get_room_repository
from src.schemas.room import ROOM_ID_PATTERN
from src.tools import gallery, project_files, room_tools
from src.tools.project_files_view import ProjectFilesView
from src.tools.quota import check_quota, increment_quota, quota_denial
from src.tools.quote_submit_tools import submit_quote_request_wrapper

logger = logging.getLogger(__name__)

_RENDER_LOGIN_REQUIRED = (
    "LOGIN_REQUIRED: i render sono riservati agli utenti registrati. "
    "Chiama request_login_adk e chiedi all'utente di accedere."
)


_QUOTE_LOGIN_REQUIRED = (
    "LOGIN_REQUIRED: il preventivo è riservato agli utenti registrati. "
    "Chiama request_login_adk e chiedi all'utente di accedere."
)


async def _is_guest(user_id: str) -> bool:
    """🛡️ Server-side login gate for premium tools (security audit H3): the
    AUTH_GATE in the prompt is not a control — a guest or a prompt injection can
    still reach the tool. The dev auth bypass (validator-guarded) has no real
    Firebase accounts, so it is never treated as a guest."""
    if settings.ENV == "development" and settings.ALLOW_AUTH_BYPASS:
        return False
    return await is_anonymous_user(user_id)


def _trusted_session_id(tool_context: Any, claimed: str) -> str:
    """Return the ADK session id instead of the one the model passed in.

    The orchestrator opens the ADK session with the session_id that /chat/stream
    has already verified as owned by the caller. The model-supplied argument is
    never trusted: a prompt injection could point it at another user's session.
    """
    trusted: str = tool_context.session.id
    if claimed and claimed != trusted:
        # No ids in the log: a session id is an access token (CodeQL py/clear-text-logging).
        logger.warning("[ADK Tool] session_id from the model ignored (does not match the verified session)")
    return trusted

# ─── Pricing Engine ──────────────────────────────────────────────────────────

@instrumented_tool("pricing_engine")
async def pricing_engine_tool(sku: str, qty: float) -> dict[str, Any]:
    """Calculates project line-item price from the master price book.

    Looks up a SKU and returns unit price, description, and total cost.
    Does NOT accept unit_price input to prevent prompt injection.
    qty must be between 0.01 and 10000.

    Args:
        sku: The stock keeping unit identifier (e.g. 'TCHR_001').
        qty: Quantity required (0.01 – 10000).
    """
    if not (0.01 <= qty <= 10_000):
        return {"status": "error", "message": f"qty={qty} out of valid range [0.01, 10000]."}
    from src.services.pricing_service import PricingService
    await PricingService.ensure_fresh()
    item = PricingService.get_item_by_sku(sku)
    if not item:
        return {"status": "error", "message": f"SKU '{sku}' not found in price book."}
    unit_price: float = item.get("unit_price", 0.0)
    return {
        "status": "success",
        "sku": sku,
        "description": item.get("description", ""),
        "unit": item.get("unit", ""),
        "unit_price": unit_price,
        "qty": qty,
        "total": to_json_number(line_total(qty, unit_price)),
    }


# ─── Quote Submission (shared with the dashboard "Invia al team" button) ─────

@instrumented_tool("submit_quote_request")
async def submit_quote_request(session_id: str, tool_context) -> str:
    """Sends the quote request of the CURRENT project to the admin team for review.

    One project per chat, with a section per room: the whole quote is sent at
    once — the SAME path as the dashboard "Invia al team" button. The admin is
    notified by email and the client receives the final quote by email after
    approval.

    CRITICAL: call ONLY after the user gave an EXPLICIT confirmation
    ("sì, invia") on a summary of the rooms and works being sent. Never call
    automatically, never right after suggest_quote_items.

    Args:
        session_id: The current session identifier (used to resolve the user).
        tool_context: ADK ToolContext injected automatically by the runner.
    """
    if await _is_guest(tool_context.user_id):
        logger.warning("[ADK Tool] submit_quote_request blocked: anonymous user")
        return _QUOTE_LOGIN_REQUIRED
    return await submit_quote_request_wrapper(
        session_id=_trusted_session_id(tool_context, session_id), user_id=tool_context.user_id
    )


# ─── Market Prices ───────────────────────────────────────────────────────────

@instrumented_tool("market_prices")
async def get_market_prices(query: str) -> str:
    """Fetches live market prices for renovation materials and services.

    Uses the Perplexity Sonar API to retrieve real-time pricing data.

    Args:
        query: Search query (e.g. 'average cost per m2 bathroom tiles Italy').
    """
    from src.tools.market_prices import get_market_prices_wrapper
    return await get_market_prices_wrapper(query)


# ─── Customer listino (quick price ranges) ───────────────────────────────────

@instrumented_tool("search_listino")
async def search_listino(query: str) -> str:
    """Quick customer-facing price RANGE from the SYD listino (composite
    'fornitura e posa' packages). Use this FIRST for "quanto costa X?"
    questions (e.g. finestra PVC, rifacimento bagno). If it returns
    NESSUNA_VOCE_LISTINO, fall back to search_prezzario.

    Args:
        query: The work or material the customer asks about.
    """
    from src.tools.listino_tools import search_listino as _listino
    return await _listino(query)


# ─── Knowledge RAG ───────────────────────────────────────────────────────────

@instrumented_tool("retrieve_knowledge")
async def retrieve_knowledge(query: str) -> str:
    """Retrieves authoritative knowledge about renovation standards, laws,
    and SYD practices from the Pinecone vector database.

    Searches across both regulatory/normative knowledge and the regional
    price list (Tariffa Regionale Lazio 2023).

    Args:
        query: The user query or concept to look up.
    """
    from src.tools.rag_tools import retrieve_knowledge as _retrieve
    return await _retrieve(query)


@instrumented_tool("search_prezzario")
async def search_prezzario(query: str, categoria: str = "") -> str:
    """Searches the regional price list (Tariffa Regionale Lazio 2023) for
    construction work items and their official unit prices.

    Use this tool when the user asks about costs, prices, or unit rates
    for specific construction work items (demolitions, flooring, painting, etc.).

    Args:
        query: Description of the work item to search for, e.g.
               'demolizione pavimento in marmo', 'tinteggiatura pareti al mq'.
        categoria: Optional category filter to narrow results, e.g.
                   'Demolizioni e Rimozioni', 'Tinteggiature e Verniciature'.
    """
    from src.tools.rag_tools import search_prezzario as _search
    return await _search(query, categoria)


@instrumented_tool("retrieve_price_by_code")
async def retrieve_price_by_code(codice_articolo: str) -> str:
    """Looks up a specific price-list article by its exact code.

    Use this tool when the user references a specific article code like
    'A 3.02.14.a.' or 'A 14.01.15.b.' and wants the full details.

    Args:
        codice_articolo: The exact article code from the regional price list,
                         e.g. 'A 3.02.14.a.' or 'A 20.01.1.'
    """
    from src.tools.rag_tools import retrieve_price_by_code as _lookup
    return await _lookup(codice_articolo)




# ─── Render Generation ───────────────────────────────────────────────────────

_ROOM_ID = re.compile(ROOM_ID_PATTERN)

# Invocation-scoped ("temp:" is never persisted) record of this turn's render,
# keyed by invocation_id as well so it can never leak into a later turn.
_RENDER_DONE_KEY = "temp:render_done"


async def _render_source_photo(session_id: str, active_room_id: object) -> tuple[str | None, str]:
    """Photo a render starts from, and why. With a room (asked for, or the active
    one): its newest photo, else the newest photo not classified in a named room
    (no room, "Generale") — never a photo of another named room. Without rooms:
    the project's newest photo."""
    if not isinstance(active_room_id, str) or not active_room_id:
        source = await latest_uploaded_photo_url(session_id)
        return source, "project_photo" if source else "no_photo"
    repo = get_room_repository()
    photo = await repo.latest_room_photo(session_id, active_room_id)
    if photo and photo.get("url"):
        return photo["url"], "room_photo"
    photo = await repo.latest_unclassified_photo(session_id)
    if photo and photo.get("url"):
        return photo["url"], "unclassified_photo"
    return None, "room_without_photo"


async def _render_artifact_name(tool_context: Any, room_id: str | None) -> str:
    """`render_{room_id}_{n}.png`, n = the room's next render: renders of
    different rooms (or a second one of the same room) never overwrite each other."""
    prefix = f"render_{room_id or 'progetto'}_"
    # Exact match: the renders of room "camera" are not those of "camera_2".
    pattern = re.compile(rf"^{re.escape(prefix)}(\d+)\.png$")
    numbers = [int(m.group(1)) for name in await tool_context.list_artifacts() if (m := pattern.match(name))]
    return f"{prefix}{max(numbers, default=0) + 1}.png"


@instrumented_tool("generate_render")
async def generate_render(
    prompt: str,
    session_id: str,
    tool_context,
    style: str = "photorealistic",
    room_type: str = "interior",
    mode: str = "creation",
    source_image_url: str = "",
    ignore_uploaded_photo: bool = False,
    room_id: str = "",
) -> dict:
    """Generates a photorealistic 3D render of a room using Gemini + Imagen 3.

    Args:
        prompt: Detailed description of the interior design to render.
        session_id: The current project/session identifier (required for saving the render).
        tool_context: ADK ToolContext injected automatically by the runner.
        style: Design style (e.g. 'modern', 'industrial', 'minimalist', 'rustic').
        room_type: Type of room (e.g. 'living room', 'kitchen', 'bathroom').
        mode: 'creation' for text-to-image, 'modification' to transform an uploaded photo.
        source_image_url: Leave empty: the newest photo of the ACTIVE ROOM is used
            automatically (call select_room first when the user means another room).
        ignore_uploaded_photo: True ONLY if the user explicitly asks for a design from
            scratch, NOT based on the photo they uploaded.
        room_id: Leave empty to render the ACTIVE ROOM; or the id (from STANZE DEL
            PROGETTO) of the room to render. The render is filed in that room.
    """
    import logging as _logging
    _logger = _logging.getLogger(__name__)

    session_id = _trusted_session_id(tool_context, session_id)
    user_id: str = tool_context.user_id

    if await _is_guest(user_id):
        _logger.warning("[ADK Tool] generate_render blocked: anonymous user")
        return {"status": "error", "error": _RENDER_LOGIN_REQUIRED}

    decision = await check_quota(user_id, "generate_render")
    if not decision.allowed:
        _logger.warning(f"[ADK Tool] generate_render blocked: quota {decision.reason}")
        return {"status": "error", "error": quota_denial("generate_render", decision).message}

    # One render per turn: a repeated call (same invocation) returns the first
    # image instead of generating — and showing in chat — a second one.
    previous = tool_context.state.get(_RENDER_DONE_KEY)
    if previous and previous.get("invocation_id") == tool_context.invocation_id:
        _logger.warning("[ADK Tool] generate_render called twice in one turn: reusing the first render")
        return previous["result"]

    # The room rendered: the one asked for (it must be a room of this project), else the active one.
    target_room: str | None = None
    if room_id:
        try:
            if not _ROOM_ID.match(room_id) or await get_room_repository().get_room(session_id, room_id) is None:
                return {"status": "error", "error": "Stanza non trovata in questo progetto: usa un id da STANZE DEL PROGETTO."}
        except (GoogleAPIError, ValidationError) as lookup_err:
            _logger.warning(f"[ADK Tool] generate_render: room lookup failed ({type(lookup_err).__name__})")
            return {"status": "error", "error": "Non riesco a leggere la stanza in questo momento. Riprova."}
        target_room = room_id
    else:
        active = tool_context.state.get(ACTIVE_ROOM_STATE_KEY)
        target_room = active if isinstance(active, str) and active else None

    # The photo is the user's room: render FROM it (I2I) unless they asked for a
    # design from scratch. Not left to the model, which never sees photo URLs
    # (only labels like "[Foto f_1 · Bagno]").
    source: str | None = None
    reason = "from_scratch_requested"
    if not ignore_uploaded_photo:
        source = source_image_url or None
        reason = "model_url"
        if not source:
            try:
                source, reason = await _render_source_photo(session_id, target_room)
            except GoogleAPIError as lookup_err:
                _logger.warning(f"[ADK Tool] generate_render: project photo lookup failed ({lookup_err})")
                reason = "photo_lookup_failed"
    render_mode = "modification" if source else "creation"
    _logger.info(
        f"[ADK Tool] generate_render mode={render_mode} reason={reason}",
        extra={"event": "render_mode", "render_mode": "i2i" if source else "t2i",
               "reason": reason, "requested_mode": mode},
    )

    from src.tools.generate_render import generate_render_wrapper
    try:
        result = await generate_render_wrapper(
            prompt=prompt,
            room_type=room_type or "interior",
            style=style,
            session_id=session_id,
            mode=render_mode,
            source_image_url=source,
            room_id=target_room,
        )
        _logger.info(f"[ADK Tool] generate_render completed. Status: {result.get('status')}, session: {session_id}")
        if result.get("status") == "success":
            await increment_quota(user_id, "generate_render")

        # ADK 1.27 Artifact Service: register the render as an artifact so
        # other agents (e.g. quote_agent) can reference it cross-session.
        if result.get("status") == "success" and result.get("imageUrl"):
            try:
                from google.genai import types as genai_types
                image_url = result["imageUrl"]
                artifact_filename = await _render_artifact_name(tool_context, target_room)
                artifact = genai_types.Part(
                    file_data=genai_types.FileData(
                        file_uri=image_url,
                        mime_type="image/png",
                    )
                )
                version = await tool_context.save_artifact(artifact_filename, artifact)
                result["artifact_filename"] = artifact_filename
                result["artifact_version"] = version
                _logger.info(
                    f"[ADK Tool] generate_render: artifact saved '{artifact_filename}' v{version}"
                )
            except Exception as art_err:  # noqa: BLE001
                # Non-fatal: image is already in Firebase Storage
                _logger.warning(f"[ADK Tool] generate_render: artifact save skipped ({art_err})")

        if result.get("status") == "success":
            tool_context.state[_RENDER_DONE_KEY] = {
                "invocation_id": tool_context.invocation_id, "result": result,
            }
        return result
    except Exception as e:
        _logger.error(f"[ADK Tool] generate_render FAILED for session {session_id}: {e}", exc_info=True)
        return {"status": "error", "error": "Render generation failed. Please try again."}


# ─── Project Gallery ─────────────────────────────────────────────────────────

async def _project_files_view(project_id: str, room_id: str) -> ProjectFilesView | str:
    """Rooms and `files` documents the gallery / file list need; an error text
    for an unknown room. With a room: only its files (newest first)."""
    repo = get_room_repository()
    try:
        rooms = await repo.list_rooms(project_id)
        labels = {r.room_id: r.label for r in rooms}
        if not room_id:
            return ProjectFilesView(room_labels=labels, files=await repo.list_files(project_id))
        if room_id not in labels:
            return "Stanza non trovata in questo progetto: usa un id da STANZE DEL PROGETTO."
        return ProjectFilesView(
            room_labels=labels, files=await repo.files_for_room(project_id, room_id), room_only=True
        )
    except (GoogleAPIError, ValidationError) as e:
        logger.error(f"[ADK Tool] project files lookup failed: {type(e).__name__}")
        return "Errore nel caricamento dei file del progetto. Riprova."


async def show_project_gallery(session_id: str, tool_context, room_id: str = "") -> str:
    """Displays the project gallery (past renders and uploaded photos), each with its file id.

    Args:
        session_id: The project/session identifier to load gallery for.
        tool_context: ADK ToolContext injected automatically by the runner.
        room_id: Optional room id (from STANZE DEL PROGETTO): only that room's photos and renders.
    """
    project_id = _trusted_session_id(tool_context, session_id)
    view = await _project_files_view(project_id, room_id)
    if isinstance(view, str):
        return view
    # Owner = the verified session's user; Firebase SDK calls are sync -> thread.
    return await asyncio.to_thread(
        gallery.show_project_gallery, session_id=project_id, user_id=tool_context.user_id, view=view
    )


# ─── Project Files ───────────────────────────────────────────────────────────

async def list_project_files(session_id: str, tool_context, room_id: str = "") -> str:
    """Lists the files of the project (photos, videos, renders, documents) with their ids and rooms.

    Args:
        session_id: The project identifier.
        tool_context: ADK ToolContext injected automatically by the runner.
        room_id: Optional room id (from STANZE DEL PROGETTO): only that room's files.
    """
    project_id = _trusted_session_id(tool_context, session_id)
    view = await _project_files_view(project_id, room_id)
    if isinstance(view, str):
        return view
    return await asyncio.to_thread(project_files.list_project_files, project_id, user_id=tool_context.user_id, view=view)


# ─── Rooms (Phase 138: one chat for the whole home) ──────────────────────────

# Rooms belong to a registered user's project: a guest session has none, and the
# model is told to carry on without them (re-checked here, not only in the prompt).
_ROOMS_LOGIN_REQUIRED = {
    "status": "error",
    "message": "Le stanze sono disponibili solo agli utenti registrati: prosegui senza select_room.",
}

@instrumented_tool("select_room")
async def select_room(name: str, room_type: str, session_id: str, tool_context) -> dict:
    """Makes a room the ACTIVE ROOM of the conversation: finds it by name, or creates it.

    Call it as soon as the user talks about a room other than the active one
    ("passiamo alla cucina", "e il bagno?", "render del bagno"), BEFORE analysing,
    rendering or quoting that room. Renders and analyses then use only that room's media.

    Args:
        name: Room name as the user says it (e.g. 'Bagno', 'Camera dei bambini').
        room_type: One of 'cucina', 'soggiorno', 'camera', 'bagno', 'corridoio', 'altro'.
        session_id: The current session identifier.
        tool_context: ADK ToolContext injected automatically by the runner.
    """
    project_id = _trusted_session_id(tool_context, session_id)
    if await _is_guest(tool_context.user_id):
        return dict(_ROOMS_LOGIN_REQUIRED)
    result, rooms = await room_tools.select_room(project_id, name, room_type)
    if result["status"] == "success":
        tool_context.state[ACTIVE_ROOM_STATE_KEY] = result["room_id"]
        tool_context.state[ROOMS_STATE_KEY] = [
            room_index_entry(r.room_id, r.label, r.room_type, r.summary) for r in rooms
        ]
    return result


@instrumented_tool("assign_media_to_room")
async def assign_media_to_room(file_id: str, room_id: str, session_id: str, tool_context) -> dict:
    """Files a photo, video or render in a room of the project.

    Use it for media labelled "senza stanza" (e.g. "[Foto f_123 · senza stanza]")
    once you know from the image which room it shows, or when the user says a
    media belongs to another room.

    Args:
        file_id: Id from the media label (e.g. 'f_123' in "[Foto f_123 · ...]").
        room_id: Id of the room, from STANZE DEL PROGETTO (call select_room first if it does not exist).
        session_id: The current session identifier.
        tool_context: ADK ToolContext injected automatically by the runner.
    """
    project_id = _trusted_session_id(tool_context, session_id)
    if await _is_guest(tool_context.user_id):
        return dict(_ROOMS_LOGIN_REQUIRED)
    return await room_tools.assign_media(project_id, file_id, room_id)


@instrumented_tool("get_room_context")
async def get_room_context(room_id: str, session_id: str, tool_context) -> dict:
    """Returns a room's brief (measures, state, decisions) and its media with ids and labels.

    Args:
        room_id: Id of the room, from STANZE DEL PROGETTO.
        session_id: The current session identifier.
        tool_context: ADK ToolContext injected automatically by the runner.
    """
    return await room_tools.room_context(_trusted_session_id(tool_context, session_id), room_id)


# ─── Quote Item Suggestions ──────────────────────────────────────────────────

@instrumented_tool("suggest_quote_items")
async def suggest_quote_items(session_id: str, tool_context) -> str:
    """Suggests renovation line items for a quote based on conversation history.

    Analyzes the chat and proposes relevant SKUs (e.g. demolitions, flooring, painting).
    Validates all suggested SKUs against the Master Price Book before returning.
    Saves a draft QuoteSchema to Firestore under projects/{session_id}/private_data/quote.

    Args:
        session_id: The project/session identifier (required).
        tool_context: ADK ToolContext injected automatically by the runner.
    """
    from src.tools.quote_tools import suggest_quote_items_wrapper
    # 1 session = 1 project: project and owner come from the verified session,
    # never from model-supplied arguments.
    session_id = _trusted_session_id(tool_context, session_id)
    if await _is_guest(tool_context.user_id):
        logger.warning("[ADK Tool] suggest_quote_items blocked: anonymous user")
        return _QUOTE_LOGIN_REQUIRED
    return await suggest_quote_items_wrapper(
        session_id=session_id,
        project_id=session_id,
        user_id=tool_context.user_id,
    )


# ─── Auth / Login ────────────────────────────────────────────────────────────

async def request_login(tool_context) -> str:
    """Triggers the login/authentication card in the user interface.

    Call this when a guest user (unauthenticated) requests a premium feature
    (renders, quotes, CAD) or when their identity is required.

    Args:
        tool_context: ADK ToolContext injected automatically by the runner.
    """
    import logging as _logging
    _logger = _logging.getLogger(__name__)

    try:
        from google.adk.events.ui_widget import UiWidget
        widget = UiWidget(
            id="login-card",
            provider="syd",
            payload={"widget_type": "login_card"},
        )
        tool_context.render_ui_widget(widget)
        _logger.info("[ADK Tool] request_login: UiWidget rendered via tool_context")
    except Exception as e:  # noqa: BLE001
        # Graceful fallback: frontend still handles the plain string signal
        _logger.warning(f"[ADK Tool] request_login: UiWidget render failed ({e}), falling back to plain signal")

    return "LOGIN_REQUIRED_TRIGGERED"


# ─── Save Contact Phone ──────────────────────────────────────────────────────

@instrumented_tool("save_contact_phone")
async def save_contact_phone(phone: str, session_id: str, tool_context) -> str:
    """Saves the user's phone number to their profile for future use.

    Call this ONCE after the user provides their phone number during the
    quote flow. The number is stored in Firestore users/{uid} and reused
    in all future quotes — the user will never be asked again.

    Args:
        phone: The user's phone number (e.g. '+393331234567').
        session_id: The current session ID (used to resolve the user UID).
        tool_context: ADK ToolContext injected automatically by the runner.
    """
    import re

    from src.db.firebase_client import get_async_firestore_client

    phone = phone.strip()
    if not re.match(r"^\+?[0-9\s\-().]{7,20}$", phone):
        return "Numero di telefono non valido. Riprova (es. +393331234567)."

    session_id = _trusted_session_id(tool_context, session_id)
    db = get_async_firestore_client()
    try:
        session_doc = await db.collection("sessions").document(session_id).get()
        user_id = (session_doc.to_dict() or {}).get("userId") if session_doc.exists else None
        if not user_id:
            return "Impossibile salvare il numero: sessione non trovata."

        await db.collection("users").document(user_id).set(
            {"phone": phone}, merge=True
        )
        return f"✅ Numero salvato. Userò {phone} per inviarti aggiornamenti via WhatsApp."
    except Exception as e:  # noqa: BLE001
        import logging as _logging
        _logging.getLogger(__name__).error(f"[save_contact_phone] Failed: {e}")
        return "Numero ricevuto. Procedo con il preventivo."


# ─── FunctionTool wrappers (ADK 1.26: pass func directly) ────────────────────

pricing_engine_tool_adk = FunctionTool(pricing_engine_tool)
submit_quote_request_adk = FunctionTool(submit_quote_request)
market_prices_adk = FunctionTool(get_market_prices)

generate_render_adk = FunctionTool(generate_render)
show_project_gallery_adk = FunctionTool(show_project_gallery)
list_project_files_adk = FunctionTool(list_project_files)
suggest_quote_items_adk = FunctionTool(suggest_quote_items)
select_room_adk = FunctionTool(select_room)
assign_media_to_room_adk = FunctionTool(assign_media_to_room)
get_room_context_adk = FunctionTool(get_room_context)
request_login_adk = FunctionTool(request_login)
retrieve_knowledge_adk = FunctionTool(retrieve_knowledge)
search_listino_adk = FunctionTool(search_listino)
search_prezzario_adk = FunctionTool(search_prezzario)
retrieve_price_by_code_adk = FunctionTool(retrieve_price_by_code)
save_contact_phone_adk = FunctionTool(save_contact_phone)
