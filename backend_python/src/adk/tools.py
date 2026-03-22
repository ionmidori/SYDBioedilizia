"""
ADK Tools Registration.
Defines typed async functions for Vertex Agent Engine tools.

ADK 1.26 convention: pass the function directly to FunctionTool(func).
Name comes from the function name; description from the docstring.
Type hints on parameters define the input schema.
Pydantic validation is enforced via the function's argument types.
"""
from typing import Dict, Any
from google.adk.tools import FunctionTool
from src.core.telemetry import instrumented_tool


# ─── Pricing Engine ──────────────────────────────────────────────────────────

@instrumented_tool("pricing_engine")
async def pricing_engine_tool(sku: str, qty: float) -> Dict[str, Any]:
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
        "total": round(unit_price * qty, 2),
    }


# ─── Quote Approval (HITL) ───────────────────────────────────────────────────

async def request_quote_approval(
    quote_id: str,
    project_id: str,
    grand_total: float,
    tool_context,
) -> Dict[str, Any]:
    """Pauses execution and sends the quote to the administrator for approval.

    Generates a secure nonce and calls request_confirmation() so the admin
    dashboard can resume the session after review.

    Args:
        quote_id: Unique quote identifier.
        project_id: Project this quote belongs to.
        grand_total: Total euro amount for admin display.
        tool_context: ADK ToolContext injected automatically by the runner.
    """
    import secrets
    from src.adk.hitl import save_resumption_token

    tool_confirmation = getattr(tool_context, "tool_confirmation", None)
    if not tool_confirmation:
        nonce = secrets.token_urlsafe(32)
        await save_resumption_token(project_id, nonce)
        tool_context.request_confirmation(
            hint="Preventivo pronto per revisione admin. Approvare o rifiutare.",
            payload={
                "quote_id": quote_id,
                "total": grand_total,
                "nonce": nonce,
                "decision": "",
                "notes": "",
            },
        )
        return {"status": "pending_approval", "message": "Awaiting admin confirmation."}

    decision = tool_confirmation.payload.get("decision", "reject")
    if decision == "approve":
        return {"status": "approved", "notes": tool_confirmation.payload.get("notes", "")}
    return {"status": "rejected", "reason": tool_confirmation.payload.get("reason", "")}


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




# ─── Render Generation ───────────────────────────────────────────────────────

@instrumented_tool("generate_render")
async def generate_render(
    prompt: str,
    session_id: str,
    style: str = "photorealistic",
    room_type: str = "interior",
    mode: str = "creation",
    source_image_url: str = "",
) -> dict:
    """Generates a photorealistic 3D render of a room using Gemini + Imagen 3.

    Args:
        prompt: Detailed description of the interior design to render.
        session_id: The current project/session identifier (required for saving the render).
        style: Design style (e.g. 'modern', 'industrial', 'minimalist', 'rustic').
        room_type: Type of room (e.g. 'living room', 'kitchen', 'bathroom').
        mode: 'creation' for text-to-image, 'modification' to transform an uploaded photo.
        source_image_url: Firebase Storage URL of the room photo (required if mode='modification').
    """
    import logging as _logging
    _logger = _logging.getLogger(__name__)

    from src.tools.generate_render import generate_render_wrapper
    try:
        result = await generate_render_wrapper(
            prompt=prompt,
            room_type=room_type or "interior",
            style=style,
            session_id=session_id,
            mode=mode if mode in ("creation", "modification") else "creation",
            source_image_url=source_image_url or None,
        )
        _logger.info(f"[ADK Tool] generate_render completed. Status: {result.get('status')}, session: {session_id}")
        return result
    except Exception as e:
        _logger.error(f"[ADK Tool] generate_render FAILED for session {session_id}: {e}", exc_info=True)
        return {"status": "error", "error": str(e)}


# ─── Project Gallery ─────────────────────────────────────────────────────────

async def show_project_gallery(session_id: str) -> str:
    """Displays the project gallery (past renders and uploaded photos).

    Args:
        session_id: The project/session identifier to load gallery for.
    """
    from src.tools.gallery import show_project_gallery as _gallery
    return _gallery(session_id=session_id)


# ─── Project Files ───────────────────────────────────────────────────────────

async def list_project_files(session_id: str) -> str:
    """Lists DXF/CAD files and images attached to a project in Firebase Storage.

    Args:
        session_id: The project identifier.
    """
    from src.tools.project_files import list_project_files as _lp
    return _lp(session_id)


# ─── Quote Item Suggestions ──────────────────────────────────────────────────

@instrumented_tool("suggest_quote_items")
async def suggest_quote_items(
    session_id: str,
    project_id: str = "",
    user_id: str = "",
) -> str:
    """Suggests renovation line items for a quote based on conversation history.

    Analyzes the chat and proposes relevant SKUs (e.g. demolitions, flooring, painting).
    Validates all suggested SKUs against the Master Price Book before returning.
    Saves a draft QuoteSchema to Firestore under projects/{project_id}/private_data/quote.

    Args:
        session_id: The project/session identifier (required).
        project_id: Optional. Project ID if different from session_id.
        user_id: Optional. UID of the authenticated user (improves quote ownership tracking).
    """
    from src.tools.quote_tools import suggest_quote_items_wrapper
    return await suggest_quote_items_wrapper(
        session_id=session_id,
        project_id=project_id or None,
        user_id=user_id or None,
    )


# ─── n8n Webhook ─────────────────────────────────────────────────────────────

@instrumented_tool("n8n_webhook")
async def trigger_n8n_webhook(workflow_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Triggers an n8n automation workflow via signed HMAC webhook.

    Delegates to the production-hardened n8n implementation that includes:
    - SSRF host allowlist validation (N8N_ALLOWED_WEBHOOK_HOSTS)
    - HMAC-SHA256 signing with timestamp (replay-attack prevention)
    - Exponential backoff retry (tenacity)
    - Idempotency key in payload

    Each workflow_id maps to a dedicated n8n webhook URL (separate workflows):
    - "lead_submission"  → N8N_WEBHOOK_NOTIFY_ADMIN  (new lead/quote ready for admin review)
    - "quote_delivery"   → N8N_WEBHOOK_DELIVER_QUOTE (send approved quote PDF to client)

    Args:
        workflow_id: Logical workflow identifier. Maps to a specific webhook URL in settings.
        payload: JSON payload to send to the workflow.
    """
    from src.core.config import settings
    from src.tools.n8n_mcp_tools import _call_n8n_webhook, _validate_webhook_url
    import logging

    _logger = logging.getLogger(__name__)

    # Each workflow has its own dedicated n8n webhook URL (not a suffix)
    _WORKFLOW_URL_MAP = {
        "lead_submission": settings.N8N_WEBHOOK_NOTIFY_ADMIN,
        "quote_delivery": settings.N8N_WEBHOOK_DELIVER_QUOTE,
    }

    webhook_url = _WORKFLOW_URL_MAP.get(workflow_id)
    if not webhook_url:
        if workflow_id not in _WORKFLOW_URL_MAP:
            return {"status": "error", "message": f"Unknown workflow_id '{workflow_id}'. Valid values: {list(_WORKFLOW_URL_MAP.keys())}."}
        return {"status": "error", "message": f"Webhook URL for '{workflow_id}' is not configured in environment."}

    try:
        _validate_webhook_url(webhook_url)  # SSRF guard — raises ValueError if invalid host
        result = await _call_n8n_webhook(webhook_url, {"workflow_id": workflow_id, **payload})
        _logger.info("[ADK Tool] n8n webhook triggered.", extra={"workflow_id": workflow_id})
        return {"status": "success", "result": result}
    except ValueError as e:
        _logger.error("[ADK Tool] n8n webhook blocked — SSRF guard: %s", e)
        return {"status": "error", "message": "Webhook host not allowed."}
    except Exception as e:
        _logger.error("[ADK Tool] n8n webhook failed: %s", e, exc_info=True)
        return {"status": "error", "message": "Failed to trigger n8n workflow."}



# ─── Auth / Login ────────────────────────────────────────────────────────────

async def request_login() -> str:
    """Triggers the login/authentication card in the user interface.
    
    Call this when a guest user (unauthenticated) requests a premium feature 
    (renders, quotes, CAD) or when their identity is required.
    """
    return "LOGIN_REQUIRED_TRIGGERED"


# ─── FunctionTool wrappers (ADK 1.26: pass func directly) ────────────────────

pricing_engine_tool_adk = FunctionTool(pricing_engine_tool)
request_quote_approval_adk = FunctionTool(request_quote_approval)
market_prices_adk = FunctionTool(get_market_prices)

generate_render_adk = FunctionTool(generate_render)
show_project_gallery_adk = FunctionTool(show_project_gallery)
list_project_files_adk = FunctionTool(list_project_files)
suggest_quote_items_adk = FunctionTool(suggest_quote_items)
trigger_n8n_webhook_adk = FunctionTool(trigger_n8n_webhook)
request_login_adk = FunctionTool(request_login)
