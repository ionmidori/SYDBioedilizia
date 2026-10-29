import asyncio
import hashlib
import logging
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any

from google.api_core.exceptions import GoogleAPIError
from google.genai import types as genai_types
from pydantic import BaseModel, Field, ValidationError
from src.core.config import settings
from src.core.models import ModelRole, get_genai_client, get_model_id
from src.db.firebase_client import get_async_firestore_client
from src.repositories.conversation_repository import ConversationRepository
from src.repositories.room_repository import get_room_repository
from src.schemas.quote import QuoteRequest
from src.schemas.room import DEFAULT_ROOM_ID, DEFAULT_ROOM_LABEL, RoomSchema
from src.services.insight_engine import InsightAnalysis, InsightEngineError, SKUItemSuggestion, get_insight_engine
from src.services.pricing_service import PricingService
from src.services.quote_dossier import gather_dossier_inputs
from src.services.quote_drafts import DraftSaveOutcome, save_ai_draft
from src.services.room_aggregation import aggregate_rooms, load_rules, room_sections
from src.tools.room_tools import brief_lines, room_of
from src.utils.datetime_utils import utc_now
from src.utils.download import MediaUnavailableError, download_session_media, session_media_path
from src.vision.measure_room import (
    MeasurementError,
    format_measurements_for_insight,
    measure_room_from_photo,
)

logger = logging.getLogger(__name__)

# Quantity bounds: reject AI-suggested quantities outside this range to prevent pricing injection
_MIN_QTY = 0.01   # Allow fractional units (e.g. 0.5 m²)
_MAX_QTY = 10_000  # Hard cap — anything above is almost certainly an AI hallucination

# Messages read to build the quote: enough for a long, multi-room conversation.
# Each one is cut to 500 chars in the summary (build_chat_summary), so the text
# stays far below the model's context.
_QUOTE_HISTORY_MESSAGES = 150
# Photos/videos sent inline to the InsightEngine: the most recent ones (per room
# when the project has rooms). A long chat can hold dozens, and every one is
# downloaded and sent in a single request.
_QUOTE_MEDIA_MAX = 8


class SuggestQuoteItemsInput(BaseModel):
    model_config = {"extra": "forbid"}
    session_id: str = Field(..., description="The ID of the current chat session")
    project_id: str | None = Field(None, description="Optional: ID of the project associated with the session")
    user_id: str | None = Field(None, description="Optional: UID of the user")

def build_chat_summary(history: list[dict[str, Any]], limit_chars: int = 500) -> str:
    """
    Extracts a readable summary from chat history, truncating long messages.
    Pattern: QUANTITY_SURVEYOR.md
    """
    lines = []
    for msg in history:
        role = msg.get("role", "user")
        content = str(msg.get("content", ""))
        if len(content) > limit_chars:
            content = content[:limit_chars] + "..."
        lines.append(f"{role.upper()}: {content}")
    return "\n".join(lines)

def validate_sku_suggestions(suggestions: list[Any]) -> list[str]:
    """
    Verifies that suggested SKUs exist in the Price Book.
    Pattern: QUANTITY_SURVEYOR.md
    """
    price_book = PricingService.load_price_book()
    valid_skus = {i["sku"] for i in price_book}

    unknown_skus = []
    for s in suggestions:
        if s.sku not in valid_skus:
            unknown_skus.append(s.sku)
            logger.warning(f"[QS] SKU sconosciuto dall'AI: {s.sku}")

    return unknown_skus


def _validate_qty_bounds(suggestions: list[Any]) -> tuple[list[Any], list[str]]:
    """
    Filters out suggestions with quantities outside safe bounds (_MIN_QTY .. _MAX_QTY).
    Returns (valid_suggestions, list_of_warning_messages).
    Prevents pricing injection via AI-hallucinated extreme quantities.
    """
    valid = []
    warnings = []
    for s in suggestions:
        qty = getattr(s, "qty", None)
        if qty is None or qty < _MIN_QTY or qty > _MAX_QTY:
            msg = f"SKU {s.sku}: qty={qty} rejected (must be {_MIN_QTY} ≤ qty ≤ {_MAX_QTY})"
            logger.warning(f"[QuoteTool] Qty out of bounds — {msg}")
            warnings.append(msg)
        else:
            valid.append(s)
    return valid, warnings

def _extract_media_urls(history: list[dict[str, Any]]) -> list[str]:
    """
    Extracts all media URLs from chat history attachments.

    Handles both storage formats:
    - Structured: {"images": [...], "videos": [...]}  ← current format
    - Legacy list: [{"url": "...", "type": "image"}, ...]
    """
    urls: list[str] = []
    for msg in history:
        raw = msg.get("attachments")
        if not raw:
            continue
        if isinstance(raw, dict):
            # Current format: {"images": [...], "videos": [...]}
            for url in raw.get("images") or []:
                if url:
                    urls.append(url)
            for url in raw.get("videos") or []:
                if url:
                    urls.append(url)
        elif isinstance(raw, list):
            # Legacy format: [{"url": "...", "type": "..."}]
            for att in raw:
                if isinstance(att, dict) and att.get("url"):
                    urls.append(att["url"])
    return urls


def _extract_vision_context(history: list[dict[str, Any]]) -> str:
    """
    Extracts the structured vision analysis of the original room photo from chat history.

    The Designer agent (MODE_A_DESIGNER Phase 1) writes a structured Italian analysis
    with fields "Tipo stanza", "Stile attuale", "Elementi di rilievo", etc.
    We surface this as a dedicated context block so InsightEngine can use it to
    determine the current state of the room (materials, condition, existing systems).
    """
    vision_block_lines: list[str] = []
    for msg in history:
        if msg.get("role") != "assistant":
            continue
        content = str(msg.get("content", ""))
        # Detect the structured analysis written by MODE_A_DESIGNER Phase 1
        if "Ho analizzato la tua foto" in content or "Tipo stanza" in content:
            # Take the first 1200 chars to avoid token bloat while preserving key fields
            vision_block_lines.append(content[:1200])
            break  # Only the first vision analysis matters (original photo)
    if vision_block_lines:
        return (
            "\n\n## Analisi Visiva Stanza Originale (Agentic Vision)\n"
            "L'assistente ha analizzato la foto originale del cliente con questo risultato:\n\n"
            + "\n".join(vision_block_lines)
            + "\n\nUsa questi dati per determinare lo STATO ATTUALE della stanza "
            "e identificare le demolizioni e preparazioni necessarie."
        )
    return ""


# Measurements per photo (sha256 of the image bytes → formatted block). A photo
# does not change, but every regeneration of the draft used to re-measure it
# (40–143 s each). In-process LRU: Cloud Run session affinity keeps a chat on
# one instance. The key is the content hash, so a hit requires having read the
# bytes from one of the session's own files first.
_MEASURE_CACHE_MAX = 128
_measure_cache: OrderedDict[str, str] = OrderedDict()


def _cached_measurement(key: str) -> str | None:
    value = _measure_cache.get(key)
    if value is not None:
        _measure_cache.move_to_end(key)
    return value


def _remember_measurement(key: str, value: str) -> None:
    _measure_cache[key] = value
    _measure_cache.move_to_end(key)
    while len(_measure_cache) > _MEASURE_CACHE_MAX:
        _measure_cache.popitem(last=False)


def _is_render_path(path: str) -> bool:
    return path.startswith("renders/")


async def _run_measurement_vision(media_urls: list[str], session_id: str) -> str:
    """
    Reads the first accessible photo and runs the RoomMeasurementAgent on it.

    Returns a formatted measurements block for injection into InsightEngine context,
    or an empty string on failure (non-fatal — InsightEngine falls back to defaults).

    Photos are read by Storage path (download_session_media): only this session's
    files, and still readable after the signed URL in the history has expired.
    """
    for url in media_urls:
        path = session_media_path(url, session_id)
        if path is None:
            logger.warning("[MeasureRoom] Skipping media outside the session's files.")
            continue

        # Skip renders (they're the target, not the source photo)
        if _is_render_path(path):
            continue

        try:
            content, mime_type = await download_session_media(path, session_id)
            if not mime_type.startswith("image/"):
                continue

            # Keyed by the image CONTENT, never by its path/URL: the same photo
            # re-uploaded is measured once, and a cached measurement is only
            # returned for bytes this session actually holds.
            cache_key = hashlib.sha256(content).hexdigest()
            cached = _cached_measurement(cache_key)
            if cached is not None:
                logger.info("[MeasureRoom] Reusing the measurement of this photo.")
                return cached

            measurements = await asyncio.wait_for(
                measure_room_from_photo(content, mime_type),
                timeout=settings.MEASURE_ROOM_TIMEOUT_SECONDS,
            )
            block = format_measurements_for_insight(measurements)
            _remember_measurement(cache_key, block)
            return block

        except TimeoutError:
            # Best-effort: the InsightEngine falls back to Italian averages.
            logger.warning(
                "[MeasureRoom] Measurement timed out.",
                extra={"timeout_s": settings.MEASURE_ROOM_TIMEOUT_SECONDS},
            )
            return ""
        except Exception as exc:  # noqa: BLE001
            # Never log the URL: the history holds signed URLs (bearer credentials).
            msg = str(exc) if isinstance(exc, (MeasurementError, MediaUnavailableError)) else ""
            logger.warning(
                "[MeasureRoom] Measurement failed.",
                extra={"error_type": type(exc).__name__, "error": msg[:200]},
            )
            continue

    return ""  # No accessible image found — InsightEngine uses defaults


_STRUCTURAL_VISION_PROMPT = (
    "Sei un geometra esperto in ristrutturazioni edili italiane. "
    "Ti vengono mostrate DUE immagini:\n"
    "1. FOTO ORIGINALE: lo stato attuale della stanza del cliente.\n"
    "2. RENDER OBIETTIVO: la stanza dopo la ristrutturazione immaginata.\n\n"
    "COMPITO: Confronta le due immagini e identifica SOLTANTO i lavori edili strutturali "
    "necessari per trasformare lo stato attuale nello stato del render.\n\n"
    "INCLUDI SOLO:\n"
    "- Demolizioni (pareti, tramezzi, controsoffitti, pavimenti esistenti)\n"
    "- Opere murarie (nuovi tramezzi, rivestimenti, rasature, intonaci)\n"
    "- Pavimenti e rivestimenti (posa pavimento, piastrelle, battiscopa)\n"
    "- Impianti visibili (tracce idrauliche, elettriche, termoidrauliche)\n"
    "- Infissi e serramenti (finestre, porte, vetrate)\n"
    "- Tinteggiature e pitture\n\n"
    "ESCLUDI TASSATIVAMENTE:\n"
    "- Mobili, arredi, cucine componibili\n"
    "- Lampade, lampadari, applique\n"
    "- Complementi d'arredo, tende, quadri\n"
    "- Elettrodomestici\n\n"
    "Rispondi in italiano con un elenco puntato conciso dei lavori strutturali rilevati. "
    "Se le due immagini sono simili o non ci sono differenze strutturali evidenti, scrivi: "
    "'Nessuna differenza strutturale rilevata tra foto originale e render.'"
)


async def _run_render_structural_vision(
    media_urls: list[str],
    history: list[dict[str, Any]],
    session_id: str,
) -> str:
    """
    Visually compares the original room photo with the generated render using Gemini
    to extract ONLY the structural construction work needed (no furniture).

    Returns a structural delta context block for InsightEngine injection,
    or an empty string if either image is unavailable or the call fails (non-fatal).

    Both images are read by Storage path, and only among this session's files.
    """
    paths = [p for p in (session_media_path(url, session_id) for url in media_urls) if p]

    # Find the render among the attachments, or in the history text hints
    render_path = next((p for p in paths if _is_render_path(p)), None)
    if not render_path:
        for msg in reversed(history):
            content = str(msg.get("content", ""))
            if "/renders/" not in content:
                continue
            for token in content.split():
                if "/renders/" in token and token.startswith("http"):
                    candidate = session_media_path(token.strip("[]().,"), session_id)
                    if candidate and _is_render_path(candidate):
                        render_path = candidate
                        break
            if render_path:
                break

    if not render_path:
        logger.info("[StructuralVision] No render found — skipping structural delta.")
        return ""

    # Original photo: a user upload, not a render
    photo_path = next((p for p in paths if not _is_render_path(p)), None)
    if not photo_path:
        logger.info("[StructuralVision] No original photo found — skipping structural delta.")
        return ""

    return await _structural_delta(photo_path, render_path, session_id)


async def _structural_delta(photo_ref: str, render_ref: str, session_id: str) -> str:
    """The structural works between a photo and a render of the same room ("" if none)."""
    try:
        (photo_bytes, photo_mime), (render_bytes, render_mime) = await asyncio.gather(
            download_session_media(photo_ref, session_id),
            download_session_media(render_ref, session_id),
        )

        if not photo_mime.startswith("image/") or not render_mime.startswith("image/"):
            logger.warning("[StructuralVision] Non-image content-type, skipping.")
            return ""

        client = get_genai_client()
        response = await client.aio.models.generate_content(
            model=get_model_id(ModelRole.VISION),
            contents=genai_types.Content(role="user",
                parts=[
                    genai_types.Part(text=_STRUCTURAL_VISION_PROMPT),
                    genai_types.Part(
                        inline_data=genai_types.Blob(
                            mime_type=photo_mime, data=photo_bytes
                        )
                    ),
                    genai_types.Part(
                        inline_data=genai_types.Blob(
                            mime_type=render_mime, data=render_bytes
                        )
                    ),
                ]
            ),
            config=genai_types.GenerateContentConfig(temperature=0.1),
        )

        text = ""
        content = response.candidates[0].content if response.candidates else None
        parts = content.parts if content else None
        if parts:
            for part in parts:
                if part.text:
                    text += part.text

        if not text.strip():
            return ""

        logger.info("[StructuralVision] Structural delta extracted from render vs photo comparison.")
        return (
            "\n\n## Delta Strutturale: Foto Originale vs Render (Agentic Vision)\n"
            "Analisi comparativa Gemini — lavori edili necessari per realizzare il render:\n\n"
            + text.strip()
            + "\n\nUSO: Usa SOLO questi lavori strutturali per il preventivo. "
            "NON quotare arredi, mobili o complementi visibili nel render."
        )

    except Exception as exc:  # noqa: BLE001
        logger.warning("[StructuralVision] Structural delta failed: %s", exc)
        return ""


# ── One quote, a section per room (Phase 138) ─────────────────────────────────

# Rooms analysed at the same time: each one is a measurement, a render delta and
# an InsightEngine call, all on the same model quota.
_ROOM_ANALYSIS_CONCURRENCY = 3
# A room's own messages (tagged with it) read for its analysis.
_ROOM_HISTORY_MESSAGES = 80
# Untagged / "Generale" messages given to every room as background.
_GENERAL_CONTEXT_MESSAGES = 40
# Files that make a room worth quoting (renders count: they are the target).
_ROOM_MEDIA_TYPES = frozenset({"image", "video", "render"})
COMPLETENESS_THRESHOLD = 0.70


@dataclass(frozen=True)
class _QuoteUnit:
    """What one InsightEngine call analyses: the whole chat, one room, or the
    rest of the home ("Generale": `general`, with `room` None)."""
    room: RoomSchema | None
    context: str
    media: list[str]
    general: bool = False

    @property
    def section_id(self) -> str | None:
        """Quote section of the unit's lines (None: a quote without sections)."""
        if self.general:
            return DEFAULT_ROOM_ID
        return self.room.room_id if self.room else None


@dataclass(frozen=True)
class _UnitResult:
    unit: _QuoteUnit
    analysis: InsightAnalysis
    suggestions: list[SKUItemSuggestion]
    unknown_skus: list[str]

    @property
    def needs_info(self) -> bool:
        """Completeness gate: not enough data for this unit (questions instead of a quote)."""
        if not self.analysis.missing_info:
            return False
        # "Generale" stops the quote only for lines of its own: home-wide ones
        # (protection, disposal, scaffolding) need no measure of the rest of the home.
        if self.unit.general and all(s.sku in load_rules().project_wide_skus for s in self.analysis.suggestions):
            return False
        return not self.analysis.suggestions or self.analysis.completeness_score < COMPLETENESS_THRESHOLD


def _file_ref(file_doc: dict[str, Any]) -> str:
    """How a `files` document is read: its Storage path (signed URLs expire)."""
    return str((file_doc.get("metadata") or {}).get("storage_path") or file_doc.get("url") or "")


async def _single_unit(history: list[dict[str, Any]], session_id: str) -> _QuoteUnit:
    """The whole chat as one unit (a project without rooms)."""
    # 2. Extract media URLs (handles dict and legacy list format)
    media_urls = _extract_media_urls(history)

    # 3. Agentic Vision: measure room surfaces from original photo
    # Runs Gemini 2.5 Flash + Python code execution to get real mq values.
    # Non-fatal: if no photo or analysis fails, InsightEngine uses Italian averages.
    measurement_context = await _run_measurement_vision(media_urls, session_id)
    if measurement_context:
        logger.info("[QuoteTool] Room measurements injected from agentic vision.")
    else:
        logger.info("[QuoteTool] No measurement data — InsightEngine will use defaults.")

    # 4. Agentic Vision: structural delta from render vs original photo comparison
    # Gemini 2.5 Flash visually compares both images and extracts ONLY structural
    # construction work needed (furniture/arredi are explicitly excluded).
    structural_delta = await _run_render_structural_vision(media_urls, history, session_id)
    if structural_delta:
        logger.info("[QuoteTool] Structural delta from render comparison injected.")
    else:
        logger.info("[QuoteTool] No render comparison available — using text context only.")

    # 5. Extract qualitative vision analysis from chat history (Phase 1 Designer output)
    vision_context = _extract_vision_context(history)

    # 6. Build enriched chat summary: structural delta + measurements + vision + conversation
    context = (
        structural_delta
        + measurement_context
        + vision_context
        + "\n\n## Conversazione Progetto\n"
        + build_chat_summary(history)
    )
    return _QuoteUnit(room=None, context=context, media=media_urls[-_QUOTE_MEDIA_MAX:])


def _brief_block(room: RoomSchema) -> str:
    """The room's brief (scheda stanza) as context, empty when nothing is known."""
    lines = brief_lines(room)
    return "\n\n## Scheda stanza\n" + "\n".join(lines) if lines else ""


def _room_scope(room: RoomSchema, others: list[str]) -> str:
    rules = load_rules()
    other_rooms = f" ({', '.join(others)})" if others else ""
    return (
        f"## Stanza da quotare: {room.label} ({room.room_type})\n"
        "Quota SOLO i lavori di questa stanza: quelli dei suoi messaggi, delle sue foto e, nel contesto "
        "generale, quelli che la riguardano chiaramente. NON quotare i lavori delle altre stanze"
        f"{other_rooms}: hanno un'analisi propria. Gli ambienti citati ma non creati come stanza "
        "(es. corridoio, ingresso) li quota la sezione Generale: non includerli qui.\n"
        "Lavori comuni a tutta la casa (quadro elettrico, caldaia, protezioni, ponteggio): proponili se "
        "servono anche a questa stanza, vengono contati una sola volta nella sezione Generale.\n"
        f"Smaltimento macerie {rules.container_sku}: come quantità indica la frazione di un container da "
        f"{rules.container_capacity_mc:f} m³ riempita dalle macerie di QUESTA stanza (es. 0.4)."
    )


def _general_scope(quoted: list[str]) -> str:
    rules = load_rules()
    return (
        f"## Sezione da quotare: {DEFAULT_ROOM_LABEL} (il resto della casa)\n"
        "Quota SOLO: i lavori degli ambienti citati ma NON creati come stanza (es. corridoio, ingresso, "
        "ripostiglio) e i lavori comuni a tutta la casa che non appartengono a una stanza (protezioni, "
        "ponteggio, impianti generali, pratiche).\n"
        f"NON quotare i lavori delle stanze già quotate ({', '.join(quoted)}): hanno un'analisi propria, "
        "anche quando ne parlano i messaggi qui sotto. Per un lavoro su tutta la casa (es. tinteggiatura) "
        "quota solo la parte fuori da quelle stanze.\n"
        "Se non resta nulla da quotare non proporre voci: è normale. Se il resto della casa non ha lavori "
        "propri, non fare domande su di esso (nessuna informazione mancante).\n"
        f"Smaltimento macerie {rules.container_sku}: come quantità indica la frazione di un container da "
        f"{rules.container_capacity_mc:f} m³ riempita dalle macerie del resto della casa (es. 0.2)."
    )


async def _general_unit(
    general: list[dict[str, Any]], generale_room: RoomSchema | None, quoted: list[str], project_id: str
) -> _QuoteUnit | None:
    """The rest of the home: messages without a room or in "Generale", the
    "generale" brief and the photos filed there. None when the chat has nothing
    of its own for it (no such user message, no brief)."""
    brief = _brief_block(generale_room) if generale_room else ""
    if not brief and not any(m.get("role") == "user" for m in general):
        return None
    files = await get_room_repository().files_for_room(project_id, DEFAULT_ROOM_ID)  # newest first
    media = [f for f in files if f.get("type") in ("image", "video")][:_QUOTE_MEDIA_MAX]
    messages = general[-_ROOM_HISTORY_MESSAGES:]
    context = (
        _general_scope(quoted)
        + brief
        + _extract_vision_context(messages)
        + "\n\n## Conversazione sul resto della casa\n"
        + build_chat_summary(messages)
    )
    logger.info("[QuoteTool] General context ready.", extra={"messages": len(messages), "media": len(media)})
    return _QuoteUnit(room=None, context=context, media=[_file_ref(f) for f in reversed(media)], general=True)


async def _room_unit(
    room: RoomSchema,
    others: list[str],
    general: list[dict[str, Any]],
    project_files: dict[str, dict[str, Any]],
    session_id: str,
    project_id: str,
) -> _QuoteUnit:
    """One room: its messages, its photos, measures and render delta of its own media."""
    room_messages, room_files = await asyncio.gather(
        ConversationRepository().get_context(session_id, limit=_ROOM_HISTORY_MESSAGES, room_id=room.room_id),
        get_room_repository().files_for_room(project_id, room.room_id),  # newest first
    )
    photos = [f for f in room_files if f.get("type") == "image"]
    media = [f for f in room_files if f.get("type") in ("image", "video")][:_QUOTE_MEDIA_MAX]

    # Measures: the room's reference photo first (cached by content hash), then its other photos.
    reference = project_files.get(room.reference_photo_id or "")
    candidates = ([reference] if reference else []) + [p for p in photos if p["id"] != room.reference_photo_id]

    # Delta: the room's newest render against the photo it was made from (else the newest photo).
    async def render_delta() -> str:
        render = next((f for f in room_files if f.get("type") == "render"), None)
        if render is None:
            return ""
        source_id = (render.get("metadata") or {}).get("source_file_id")
        source = project_files.get(source_id or "") or (photos[0] if photos else None)
        return await _structural_delta(_file_ref(source), _file_ref(render), session_id) if source else ""

    measurement_context, structural_delta = await asyncio.gather(
        _run_measurement_vision([_file_ref(f) for f in candidates], session_id), render_delta()
    )

    general_text = build_chat_summary(general[-_GENERAL_CONTEXT_MESSAGES:])
    context = (
        _room_scope(room, others)
        + structural_delta
        + measurement_context
        + _brief_block(room)
        + _extract_vision_context(room_messages)
        + f"\n\n## Conversazione della stanza {room.label}\n"
        + (build_chat_summary(room_messages) or "(nessun messaggio dedicato a questa stanza)")
        + ("\n\n## Contesto generale del progetto (solo per capire il progetto)\n" + general_text if general_text else "")
    )
    logger.info(
        "[QuoteTool] Room context ready.",
        extra={"room_id": room.room_id, "messages": len(room_messages), "media": len(media),
               "measured": bool(measurement_context), "render_delta": bool(structural_delta)},
    )
    return _QuoteUnit(room=room, context=context, media=[_file_ref(f) for f in reversed(media)])


async def _rooms_to_quote(
    project_id: str, history: list[dict[str, Any]]
) -> tuple[list[RoomSchema], list[RoomSchema], dict[str, dict[str, Any]]]:
    """(rooms to analyse, all rooms, project files by id). No room to analyse
    means the whole chat is one unit: no named room with messages or media, or a
    chat without any message tagged with a room (a project from before rooms,
    whose talk would otherwise be only background to the one room with a photo)."""
    repo = get_room_repository()
    try:
        rooms, files = await asyncio.gather(repo.list_rooms(project_id), repo.list_files(project_id))
    except (GoogleAPIError, ValidationError) as exc:
        logger.warning("[QuoteTool] Rooms not readable: one quote for the whole chat.", extra={"error": type(exc).__name__})
        return [], [], {}
    tagged = {m["room_id"] for m in history if m.get("room_id") not in (None, DEFAULT_ROOM_ID)}
    if not tagged:
        return [], rooms, {}
    used = tagged | {room_of(f) for f in files if f.get("type") in _ROOM_MEDIA_TYPES}
    to_quote = [r for r in rooms if r.room_id != DEFAULT_ROOM_ID and r.room_id in used]
    return to_quote, rooms, {f["id"]: f for f in files}


async def _analyse(unit: _QuoteUnit, session_id: str) -> _UnitResult:
    """InsightEngine on one unit, then SKU and quantity validation."""
    # 7. Analyze with Insight Engine (uses Gemini response_schema structured output)
    analysis = await get_insight_engine().analyze_project_for_quote(
        [{"role": "user", "content": unit.context}], unit.media, session_id=session_id
    )
    # Validation Pattern: SKU existence check. No ensure_fresh() here: the price book
    # was renewed before the prompt was built (insight engine), and renewing it
    # again after the long model call could validate against a newer version.
    unknown_skus = validate_sku_suggestions(analysis.suggestions) if analysis.suggestions else []
    known = [s for s in analysis.suggestions if s.sku not in unknown_skus]
    # Validation Pattern: quantity bounds check (pricing injection prevention)
    valid, qty_warnings = _validate_qty_bounds(known)
    if qty_warnings:
        logger.warning(f"[QuoteTool] Filtered {len(qty_warnings)} suggestion(s) with out-of-bounds qty")
    return _UnitResult(unit=unit, analysis=analysis, suggestions=valid, unknown_skus=unknown_skus)


def _single_unit_reply(result: _UnitResult) -> str | None:
    """Why the whole-chat analysis cannot become a quote (None: it can)."""
    analysis = result.analysis
    if not analysis.suggestions:
        if analysis.missing_info:
            questions = " ".join(analysis.missing_info[:2])
            return (
                f"Ho capito il progetto: {analysis.summary}\n\n"
                f"Prima di prepararti un preventivo accurato, ho bisogno di qualche informazione. "
                f"{questions}"
            )
        return (
            f"Ho difficoltà a identificare le lavorazioni specifiche da quotare. "
            f"Puoi dirmi le dimensioni approssimative dell'ambiente "
            f"e quali lavori hai in mente? ({analysis.summary})"
        )
    if len(result.unknown_skus) == len(analysis.suggestions):
        logger.warning("[QuoteTool] All AI suggestions had unknown SKUs.", extra={"unknown_skus": result.unknown_skus})
        return (
            f"Ho identificato alcune lavorazioni potenziali ({', '.join(result.unknown_skus)}) "
            "ma non corrispondono al listino prezzi attuale. "
            "Un nostro consulente ti contatterà per un preventivo personalizzato."
        )
    if not result.suggestions:
        return "La generazione del preventivo non è riuscita: le quantità suggerite erano fuori dai limiti accettabili. Descrivi il progetto in modo più dettagliato."
    # ── Completeness Gate (Opzione C) ─────────────────────────────────────────
    # If the InsightEngine signals that data is insufficient (score < 0.7),
    # return the missing questions instead of an incomplete quote.
    if result.needs_info:
        logger.info(
            "[QuoteTool] Completeness gate triggered.",
            extra={"score": analysis.completeness_score, "missing": analysis.missing_info},
        )
        formatted_questions = " ".join(analysis.missing_info[:2])  # max 2 questions per turn
        return (
            f"Ho identificato le lavorazioni principali ({analysis.summary}), "
            f"ma ho bisogno di qualche dettaglio in più per un preventivo preciso.\n\n"
            f"{formatted_questions}"
        )
    return None


def _room_label(result: _UnitResult) -> str:
    return result.unit.room.label if result.unit.room else DEFAULT_ROOM_LABEL


def _rooms_reply(results: list[_UnitResult]) -> str | None:
    """Why the rooms cannot become one quote (None: they can). A room short of
    data stops the whole quote: a home quote without that room would be wrong."""
    gated = [r for r in results if r.needs_info]
    if gated:
        logger.info("[QuoteTool] Completeness gate triggered.", extra={"rooms": [_room_label(r) for r in gated]})
        questions = "\n".join(f"**{_room_label(r)}**: {' '.join(r.analysis.missing_info[:2])}" for r in gated)
        return (
            "Prima di prepararti un preventivo accurato per tutta la casa ho bisogno di qualche "
            f"dettaglio in più.\n\n{questions}"
        )
    discarded = [r for r in results if r.analysis.suggestions and not r.suggestions]
    if discarded and any(r.suggestions for r in results):
        logger.warning("[QuoteTool] Every line of a room was discarded.", extra={"rooms": [_room_label(r) for r in discarded]})
        rooms = ", ".join(_room_label(r) for r in discarded)
        return (
            f"Per {rooms} non riesco a preparare le voci dal listino in modo affidabile, quindi non registro "
            "un preventivo incompleto della casa. Descrivimi meglio i lavori previsti in quella stanza "
            "(misure e materiali) oppure un nostro consulente ti contatterà per un preventivo personalizzato."
        )
    if any(r.suggestions for r in results):
        return None
    unknown = [sku for r in results for sku in r.unknown_skus]
    if unknown:
        logger.warning("[QuoteTool] All AI suggestions had unknown SKUs.", extra={"unknown_skus": unknown})
        return (
            f"Ho identificato alcune lavorazioni potenziali ({', '.join(unknown)}) "
            "ma non corrispondono al listino prezzi attuale. "
            "Un nostro consulente ti contatterà per un preventivo personalizzato."
        )
    return (
        "Ho difficoltà a identificare le lavorazioni specifiche da quotare. "
        "Puoi dirmi, stanza per stanza, le dimensioni approssimative e quali lavori hai in mente?"
    )


async def suggest_quote_items_wrapper(session_id: str, project_id: str | None = None, user_id: str | None = None) -> str:
    """
    Analyzes the current chat session and suggests a list of quote items based on the Master Price Book.
    Use this when the user asks for a preliminary quote, cost estimation, or 'what needs to be done'.

    A project with rooms gets one quote with a section per room: every room is
    analysed on its own (its messages, photos, measures and render), in parallel,
    and the rooms are merged by `room_aggregation` (project-wide lines in "Generale").
    The rest of the home (messages without a room, places never created as a
    room, the "generale" brief) is one more unit, quoted in "Generale" without
    the rooms already quoted.
    """
    target_project_id = project_id or session_id
    try:
        # 1. Load context (wide window: the original photo analysis and every room discussed)
        repo = ConversationRepository()
        history = await repo.get_context(session_id, limit=_QUOTE_HISTORY_MESSAGES)
        to_quote, all_rooms, project_files = await _rooms_to_quote(target_project_id, history)

        # A room that cannot be analysed (model or Firestore error) stops the
        # home quote: the other rooms are cancelled, no partial quote is saved.
        failure: BaseExceptionGroup | None = None
        results: list[_UnitResult] = []
        try:
            if to_quote:
                general = [m for m in history if m.get("room_id") in (None, DEFAULT_ROOM_ID)]
                semaphore = asyncio.Semaphore(_ROOM_ANALYSIS_CONCURRENCY)

                async def analyse_room(room: RoomSchema) -> _UnitResult:
                    others = [r.label for r in to_quote if r.room_id != room.room_id]
                    async with semaphore:
                        unit = await _room_unit(room, others, general, project_files, session_id, target_project_id)
                        return await _analyse(unit, session_id)

                async def analyse_rest_of_home() -> _UnitResult | None:
                    generale = next((r for r in all_rooms if r.room_id == DEFAULT_ROOM_ID), None)
                    async with semaphore:
                        unit = await _general_unit(general, generale, [r.label for r in to_quote], target_project_id)
                        return await _analyse(unit, session_id) if unit else None

                async with asyncio.TaskGroup() as group:
                    tasks = [group.create_task(analyse_room(room)) for room in to_quote]
                    rest_of_home = group.create_task(analyse_rest_of_home())
                results = [task.result() for task in tasks]
                # "Generale" with nothing to quote adds no section and stops nothing.
                rest = rest_of_home.result()
                if rest is not None and rest.analysis.suggestions:
                    results.append(rest)
            else:
                results = [await _analyse(await _single_unit(history, session_id), session_id)]
        except* (InsightEngineError, GoogleAPIError, ValidationError) as errors:
            failure = errors
        if failure is not None:
            logger.error(
                "[QuoteTool] Project analysis failed.",
                extra={"errors": [f"{type(e).__name__}: {str(e)[:200]}" for e in failure.exceptions]},
            )
            return (
                "Non è stato possibile analizzare automaticamente il progetto in questo momento. "
                "Ti chiedo di descrivermi le lavorazioni previste e ti fornirò un preventivo manuale."
            )
        refusal = _rooms_reply(results) if to_quote else _single_unit_reply(results[0])
        if refusal is not None:
            return refusal

        # 8. Generate Pricing
        sku_list = [
            {
                "sku": s.sku,
                "qty": s.qty,
                "ai_reasoning": s.ai_reasoning,
                "phase": getattr(s, "phase", "Lavori"),
                "room_id": r.unit.section_id,
            }
            for r in results
            for s in r.suggestions
        ]
        # We need a user_id. If not provided, we try to get it from context or use session_id
        final_user_id = user_id or "guest_" + session_id

        quote = PricingService.create_quote_from_skus(target_project_id, final_user_id, sku_list)
        if to_quote:
            # One quote for the home: project-wide lines once, in "Generale".
            items = aggregate_rooms(quote.items, {r.room_id: r.label for r in all_rooms})
            quote = quote.model_copy(update={
                "items": items,
                "rooms": room_sections(all_rooms, items),
                "financials": PricingService.calculate_financials(items),
            })
            summary = "\n".join(f"{_room_label(r)}: {r.analysis.summary}" for r in results if r.suggestions)
            headline = "\n".join(f"**{_room_label(r)}** — {r.analysis.summary}" for r in results if r.suggestions)
        else:
            summary = results[0].analysis.summary
            headline = f"**{summary}**"

        # Sanity check: suspiciously low totals often indicate malformed AI output
        if quote.financials.grand_total < 100 and len(quote.items) > 1:
            logger.warning(
                f"[QuoteTool] Suspicious grand_total=€{quote.financials.grand_total:.2f} "
                f"for {len(quote.items)} items (project={target_project_id}). "
                "Verify pricing service and AI output."
            )

        # 9. Save the draft to Firestore (projects/{projectId}/private_data/quote)
        # in a transaction: never overwrite a quote the admin already owns, and
        # assign the human-readable PRV number on creation.
        db = get_async_firestore_client()
        # Dossier for the admin (client, site details, photos/renders):
        # gathered outside the transaction, best-effort, never blocks the draft.
        now = utc_now()
        dossier = await gather_dossier_inputs(db, target_project_id, final_user_id, now)
        saved = await save_ai_draft(
            db,
            target_project_id,
            quote,
            QuoteRequest(summary=summary, channel="chat", session_id=session_id),
            now=now,
            dossier=dossier,
        )
        reference = f" (riferimento **{saved.quote_number}**)" if saved.quote_number else ""

        if saved.outcome is DraftSaveOutcome.SKIPPED:
            return (
                f"La tua richiesta di preventivo{reference} è già in mano al nostro team "
                "tecnico, quindi non la modifico da qui. Se vuoi aggiungere o cambiare "
                "qualcosa scrivimelo pure: lo riporto al team, che aggiornerà il preventivo "
                "prima di inviartelo via email."
            )

        # 10. Return a NEUTRAL Italian summary — the draft (items + prices) is
        # deliberately NOT shown to the client: the admin reviews and adjusts
        # it first in the dashboard, then the client receives the final quote
        # by email after approval. Only the works summary is disclosed.
        room_labels = ", ".join(room.room_label for room in quote.rooms)
        sections = f" in {len(quote.rooms)} sezioni ({room_labels})" if len(quote.rooms) > 1 else ""
        response = (
            f"{headline}\n\n"
            f"Ho registrato la tua richiesta di preventivo{reference}: ho identificato "
            f"{len(quote.items)} lavorazioni{sections} da sottoporre al nostro team tecnico.\n\n"
            "Il team esaminerà la richiesta, definirà le voci e i prezzi e "
            "riceverai il preventivo dettagliato via email dopo la revisione.\n\n"
            "Vuoi che invii ora la richiesta al team?"
        )

        # The team is notified only when the client confirms the submission
        # (submit_quote_request tool or the "Invia al team" button).

        return response

    except Exception:
        logger.error("[QuoteTool] Unexpected error during quote generation.", exc_info=True)
        return (
            "Si è verificato un errore imprevisto durante la generazione del preventivo. "
            "Il nostro team è stato notificato. Riprova tra qualche minuto."
        )

suggest_quote_items = suggest_quote_items_wrapper
