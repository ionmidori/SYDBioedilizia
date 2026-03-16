from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import asyncio
import logging
import httpx
from urllib.parse import urlparse
from google import genai
from google.genai import types as genai_types
from src.services.insight_engine import get_insight_engine, InsightEngineError
from src.services.pricing_service import PricingService
from src.repositories.conversation_repository import ConversationRepository
from src.db.firebase_client import get_async_firestore_client
from src.vision.measure_room import measure_room_from_photo, format_measurements_for_insight
from src.core.config import settings

logger = logging.getLogger(__name__)

# Quantity bounds: reject AI-suggested quantities outside this range to prevent pricing injection
_MIN_QTY = 0.01   # Allow fractional units (e.g. 0.5 m²)
_MAX_QTY = 10_000  # Hard cap — anything above is almost certainly an AI hallucination


class SuggestQuoteItemsInput(BaseModel):
    model_config = {"extra": "forbid"}
    session_id: str = Field(..., description="The ID of the current chat session")
    project_id: Optional[str] = Field(None, description="Optional: ID of the project associated with the session")
    user_id: Optional[str] = Field(None, description="Optional: UID of the user")

def build_chat_summary(history: List[Dict[str, Any]], limit_chars: int = 500) -> str:
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

def validate_sku_suggestions(suggestions: List[Any]) -> List[str]:
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


def _validate_qty_bounds(suggestions: List[Any]) -> tuple[List[Any], List[str]]:
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

def _extract_media_urls(history: List[Dict[str, Any]]) -> List[str]:
    """
    Extracts all media URLs from chat history attachments.

    Handles both storage formats:
    - Structured: {"images": [...], "videos": [...]}  ← current format
    - Legacy list: [{"url": "...", "type": "image"}, ...]
    """
    urls: List[str] = []
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


def _extract_vision_context(history: List[Dict[str, Any]]) -> str:
    """
    Extracts the structured vision analysis of the original room photo from chat history.

    The Designer agent (MODE_A_DESIGNER Phase 1) writes a structured Italian analysis
    with fields "Tipo stanza", "Stile attuale", "Elementi di rilievo", etc.
    We surface this as a dedicated context block so InsightEngine can use it to
    determine the current state of the room (materials, condition, existing systems).
    """
    vision_block_lines: List[str] = []
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


async def _run_measurement_vision(media_urls: List[str]) -> str:
    """
    Downloads the first accessible image and runs the RoomMeasurementAgent on it.

    Returns a formatted measurements block for injection into InsightEngine context,
    or an empty string on failure (non-fatal — InsightEngine falls back to defaults).

    SSRF protection: Only fetches URLs from the configured Firebase Storage bucket.
    """
    bucket = settings.FIREBASE_STORAGE_BUCKET or ""
    for url in media_urls:
        parsed = urlparse(url)
        hostname_ok = parsed.hostname == bucket
        path_ok = (
            bucket
            and parsed.hostname == "storage.googleapis.com"
            and parsed.path.startswith(f"/{bucket}/")
        )
        if not (hostname_ok or path_ok):
            logger.warning("[MeasureRoom] Skipping unauthorized URL: %s", parsed.hostname)
            continue

        # Skip renders (they're the target, not the source photo)
        if "/renders/" in url:
            continue

        try:
            async with httpx.AsyncClient(timeout=15.0) as http_client:
                resp = await http_client.get(url)
                resp.raise_for_status()

            mime_type = resp.headers.get("content-type", "image/jpeg").split(";")[0].strip()
            if not mime_type.startswith("image/"):
                continue

            measurements = await measure_room_from_photo(resp.content, mime_type)
            return format_measurements_for_insight(measurements)

        except Exception as exc:
            logger.warning("[MeasureRoom] Measurement failed for %s: %s", url, exc)
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
    media_urls: List[str],
    history: List[Dict[str, Any]],
) -> str:
    """
    Visually compares the original room photo with the generated render using Gemini
    to extract ONLY the structural construction work needed (no furniture).

    Returns a structural delta context block for InsightEngine injection,
    or an empty string if either image is unavailable or the call fails (non-fatal).

    SSRF protection: Only fetches URLs from the configured Firebase Storage bucket.
    """
    bucket = settings.FIREBASE_STORAGE_BUCKET or ""

    def _is_allowed_url(url: str) -> bool:
        parsed = urlparse(url)
        return (
            parsed.hostname == bucket
            or (
                bucket
                and parsed.hostname == "storage.googleapis.com"
                and parsed.path.startswith(f"/{bucket}/")
            )
        )

    # Find render URL from media_urls or from history text hints
    render_url: Optional[str] = None
    for url in media_urls:
        if _is_allowed_url(url) and "/renders/" in url:
            render_url = url
            break

    # Fallback: scan history for render URL hint injected by orchestrator
    if not render_url:
        for msg in reversed(history):
            content = str(msg.get("content", ""))
            if "/renders/" in content:
                for token in content.split():
                    if "/renders/" in token and token.startswith("http"):
                        candidate = token.strip("[]().,")
                        if _is_allowed_url(candidate):
                            render_url = candidate
                            break
            if render_url:
                break

    if not render_url:
        logger.info("[StructuralVision] No render URL found — skipping structural delta.")
        return ""

    # Find original photo URL (user upload, not a render)
    photo_url: Optional[str] = None
    for url in media_urls:
        if _is_allowed_url(url) and "/renders/" not in url:
            photo_url = url
            break

    if not photo_url:
        logger.info("[StructuralVision] No original photo found — skipping structural delta.")
        return ""

    try:
        async with httpx.AsyncClient(timeout=20.0) as http_client:
            photo_resp, render_resp = await asyncio.gather(
                http_client.get(photo_url),
                http_client.get(render_url),
            )
            photo_resp.raise_for_status()
            render_resp.raise_for_status()

        photo_mime = photo_resp.headers.get("content-type", "image/jpeg").split(";")[0].strip()
        render_mime = render_resp.headers.get("content-type", "image/jpeg").split(";")[0].strip()

        if not photo_mime.startswith("image/") or not render_mime.startswith("image/"):
            logger.warning("[StructuralVision] Non-image content-type, skipping.")
            return ""

        client = genai.Client(api_key=settings.api_key)
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash-preview-05-20",
            contents=genai_types.Content(
                parts=[
                    genai_types.Part(text=_STRUCTURAL_VISION_PROMPT),
                    genai_types.Part(
                        inline_data=genai_types.Blob(
                            mime_type=photo_mime, data=photo_resp.content
                        )
                    ),
                    genai_types.Part(
                        inline_data=genai_types.Blob(
                            mime_type=render_mime, data=render_resp.content
                        )
                    ),
                ]
            ),
            config=genai_types.GenerateContentConfig(temperature=0.1),
        )

        text = ""
        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
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

    except Exception as exc:
        logger.warning("[StructuralVision] Structural delta failed: %s", exc)
        return ""


async def suggest_quote_items_wrapper(session_id: str, project_id: Optional[str] = None, user_id: Optional[str] = None) -> str:
    """
    Analyzes the current chat session and suggests a list of quote items based on the Master Price Book.
    Use this when the user asks for a preliminary quote, cost estimation, or 'what needs to be done'.
    """
    try:
        # 1. Load context (increased limit to capture original photo analysis)
        repo = ConversationRepository()
        history = await repo.get_context(session_id, limit=40)

        # 2. Extract media URLs (handles dict and legacy list format)
        media_urls = _extract_media_urls(history)

        # 3. Agentic Vision: measure room surfaces from original photo
        # Runs Gemini 2.5 Flash + Python code execution to get real mq values.
        # Non-fatal: if no photo or analysis fails, InsightEngine uses Italian averages.
        measurement_context = await _run_measurement_vision(media_urls)
        if measurement_context:
            logger.info("[QuoteTool] Room measurements injected from agentic vision.")
        else:
            logger.info("[QuoteTool] No measurement data — InsightEngine will use defaults.")

        # 4. Agentic Vision: structural delta from render vs original photo comparison
        # Gemini 2.5 Flash visually compares both images and extracts ONLY structural
        # construction work needed (furniture/arredi are explicitly excluded).
        structural_delta = await _run_render_structural_vision(media_urls, history)
        if structural_delta:
            logger.info("[QuoteTool] Structural delta from render comparison injected.")
        else:
            logger.info("[QuoteTool] No render comparison available — using text context only.")

        # 5. Extract qualitative vision analysis from chat history (Phase 1 Designer output)
        vision_context = _extract_vision_context(history)

        # 6. Build enriched chat summary: structural delta + measurements + vision + conversation
        chat_summary = build_chat_summary(history)
        enriched_summary = (
            structural_delta
            + measurement_context
            + vision_context
            + "\n\n## Conversazione Progetto\n"
            + chat_summary
        )

        # 7. Analyze with Insight Engine (uses Gemini response_schema structured output)
        engine = get_insight_engine()
        summary_message = [{"role": "user", "content": enriched_summary}]
        try:
            analysis = await engine.analyze_project_for_quote(summary_message, media_urls)
        except InsightEngineError as exc:
            logger.error("[QuoteTool] InsightEngine failed.", extra={"error": str(exc)})
            return (
                "Non è stato possibile analizzare automaticamente il progetto in questo momento. "
                "Ti chiedo di descrivermi le lavorazioni previste e ti fornirò un preventivo manuale."
            )
        
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

        # Validation Pattern: SKU existence check
        unknown_skus = validate_sku_suggestions(analysis.suggestions)
        valid_suggestions = [s for s in analysis.suggestions if s.sku not in unknown_skus]

        if not valid_suggestions:
            logger.warning(
                "[QuoteTool] All AI suggestions had unknown SKUs.",
                extra={"unknown_skus": unknown_skus},
            )
            return (
                f"Ho identificato alcune lavorazioni potenziali ({', '.join(unknown_skus)}) "
                "ma non corrispondono al listino prezzi attuale. "
                "Un nostro consulente ti contatterà per un preventivo personalizzato."
            )

        # Validation Pattern: quantity bounds check (pricing injection prevention)
        valid_suggestions, qty_warnings = _validate_qty_bounds(valid_suggestions)
        if qty_warnings:
            logger.warning(f"[QuoteTool] Filtered {len(qty_warnings)} suggestion(s) with out-of-bounds qty")
        if not valid_suggestions:
            return "La generazione del preventivo non è riuscita: le quantità suggerite erano fuori dai limiti accettabili. Descrivi il progetto in modo più dettagliato."

        # ── Completeness Gate (Opzione C) ─────────────────────────────────────────
        # If the InsightEngine signals that data is insufficient (score < 0.7),
        # return the missing questions instead of an incomplete quote.
        COMPLETENESS_THRESHOLD = 0.70
        if analysis.completeness_score < COMPLETENESS_THRESHOLD and analysis.missing_info:
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

        # 8. Generate Pricing
        sku_list = [
            {
                "sku": s.sku,
                "qty": s.qty,
                "ai_reasoning": s.ai_reasoning,
                "phase": getattr(s, "phase", "Lavori"),
            }
            for s in valid_suggestions
        ]
        # We need a user_id. If not provided, we try to get it from context or use session_id
        final_user_id = user_id or "guest_" + session_id
        
        quote = PricingService.create_quote_from_skus(project_id or session_id, final_user_id, sku_list)

        # Sanity check: suspiciously low totals often indicate malformed AI output
        if quote.financials.grand_total < 100 and len(quote.items) > 1:
            logger.warning(
                f"[QuoteTool] Suspicious grand_total=€{quote.financials.grand_total:.2f} "
                f"for {len(quote.items)} items (project={project_id or session_id}). "
                "Verify pricing service and AI output."
            )

        # 9. Save the draft to Firestore (Collection: projects/{projectId}/private_data/quote)
        db = get_async_firestore_client()
        target_project_id = project_id or session_id
        
        quote_ref = db.collection('projects').document(target_project_id).collection('private_data').document('quote')
        await quote_ref.set(quote.model_dump(exclude_none=True))
        
        # 10. Return human-readable Italian summary, grouped by WBS phase
        response = f"**{analysis.summary}**\n\nHo preparato una bozza di preventivo sulla base della nostra conversazione:\n\n"

        # Group items by WBS phase for readability
        from collections import defaultdict
        by_phase: dict[str, list] = defaultdict(list)
        for item in quote.items:
            phase = item.category or "Lavori"
            by_phase[phase].append(item)

        for phase, items in by_phase.items():
            response += f"**{phase}**\n"
            for item in items:
                response += f"  • {item.description} ({item.qty} {item.unit}) — €{item.total:.2f}\n"
            response += "\n"

        response += f"**Subtotale: €{quote.financials.subtotal:.2f}**\n"
        response += f"**Totale (IVA inclusa): €{quote.financials.grand_total:.2f}**\n\n"

        # Add completeness note if score is moderate
        if 0.70 <= analysis.completeness_score < 0.85:
            response += (
                "_Nota: questo preventivo è basato su stime indicative. "
                "Il nostro geometra lo affinerà durante la revisione._ \n\n"
            )

        response += "Puoi revisionare e modificare questa bozza nella tua dashboard sotto 'Preventivo'."

        return response

    except InsightEngineError:
        raise  # Already handled above — should not reach here
    except Exception:
        logger.error("[QuoteTool] Unexpected error during quote generation.", exc_info=True)
        return (
            "Si è verificato un errore imprevisto durante la generazione del preventivo. "
            "Il nostro team è stato notificato. Riprova tra qualche minuto."
        )

suggest_quote_items = suggest_quote_items_wrapper
