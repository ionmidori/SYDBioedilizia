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


# ─── Pricing Engine ──────────────────────────────────────────────────────────

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

async def get_market_prices(query: str) -> str:
    """Fetches live market prices for renovation materials and services.

    Uses the Perplexity Sonar API to retrieve real-time pricing data.

    Args:
        query: Search query (e.g. 'average cost per m2 bathroom tiles Italy').
    """
    from src.tools.market_prices import get_market_prices_wrapper
    return await get_market_prices_wrapper(query)




# ─── Render Generation ───────────────────────────────────────────────────────

async def generate_render(prompt: str, style: str = "photorealistic") -> str:
    """Generates a photorealistic 3D render of a room using Gemini + Imagen 3.

    Args:
        prompt: Detailed description of the interior design to render.
        style: Design style (e.g. 'modern', 'industrial', 'photorealistic').
    """
    from src.tools.generate_render import generate_render_wrapper
    try:
        return await generate_render_wrapper(
            prompt=prompt,
            room_type="unknown",
            style=style,
            mode="text_to_image",
        )
    except Exception as e:
        return f"Render generation failed: {e}"


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
    return _lp.func(session_id)


# ─── Quote Item Suggestions ──────────────────────────────────────────────────

async def suggest_quote_items(session_id: str) -> str:
    """Suggests renovation line items for a quote based on conversation history.

    Analyzes the chat and proposes relevant SKUs (e.g. drywall, flooring, painting).

    Args:
        session_id: The project/session identifier.
    """
    from src.tools.quote_tools import suggest_quote_items_wrapper
    return await suggest_quote_items_wrapper(session_id=session_id)


# ─── n8n Webhook ─────────────────────────────────────────────────────────────

async def trigger_n8n_webhook(workflow_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Triggers an n8n automation workflow via signed HMAC webhook.

    Delegates to the production-hardened n8n implementation that includes:
    - SSRF host allowlist validation (N8N_ALLOWED_WEBHOOK_HOSTS)
    - HMAC-SHA256 signing with timestamp (replay-attack prevention)
    - Exponential backoff retry (tenacity)
    - Idempotency key in payload

    Args:
        workflow_id: The n8n workflow ID to trigger (appended to the base webhook URL).
        payload: JSON payload to send to the workflow.
    """
    from src.core.config import settings
    from src.tools.n8n_mcp_tools import _call_n8n_webhook, _validate_webhook_url
    import logging

    _logger = logging.getLogger(__name__)

    webhook_url = settings.N8N_WEBHOOK_NOTIFY_ADMIN
    if not webhook_url:
        return {"status": "error", "message": "N8N_WEBHOOK_NOTIFY_ADMIN is not configured."}

    target_url = f"{webhook_url}/{workflow_id}"

    try:
        _validate_webhook_url(target_url)  # SSRF guard — raises ValueError if invalid host
        result = await _call_n8n_webhook(target_url, payload)
        _logger.info("[ADK Tool] n8n webhook triggered.", extra={"workflow_id": workflow_id})
        return {"status": "success", "result": result}
    except ValueError as e:
        _logger.error("[ADK Tool] n8n webhook blocked — SSRF guard: %s", e)
        return {"status": "error", "message": "Webhook host not allowed."}
    except Exception as e:
        _logger.error("[ADK Tool] n8n webhook failed: %s", e, exc_info=True)
        return {"status": "error", "message": "Failed to trigger n8n workflow."}



# ─── FunctionTool wrappers (ADK 1.26: pass func directly) ────────────────────

pricing_engine_tool_adk = FunctionTool(pricing_engine_tool)
request_quote_approval_adk = FunctionTool(request_quote_approval)
market_prices_adk = FunctionTool(get_market_prices)

generate_render_adk = FunctionTool(generate_render)
show_project_gallery_adk = FunctionTool(show_project_gallery)
list_project_files_adk = FunctionTool(list_project_files)
suggest_quote_items_adk = FunctionTool(suggest_quote_items)
trigger_n8n_webhook_adk = FunctionTool(trigger_n8n_webhook)
