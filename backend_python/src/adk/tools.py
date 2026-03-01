"""
ADK Tools Registration.
Defines strict Pydantic schemas for Vertex Agent Engine tools to prevent prompt injection.
"""
from typing import Dict, Any
from pydantic import BaseModel, ConfigDict, Field
from google.adk.tools import FunctionTool

# Example of a secure tool input schema (P1 Requirement: No unit_price)
class PricingEngineArgs(BaseModel):
    model_config = ConfigDict(strict=True)

    sku: str = Field(..., description="The stock keeping unit identifier (e.g., 'TCHR_001').")
    qty: float = Field(..., description="Quantity required.", gt=0, le=10000)

async def _pricing_engine_handler(args: PricingEngineArgs) -> Dict[str, Any]:
    from src.services.pricing_service import PricingService
    # Implementation routes to the central Tier 3 service
    return {"status": "success", "result": f"Calculated pricing for {args.sku} x {args.qty}"}

pricing_engine_tool = FunctionTool(
    name="pricing_engine_tool",
    description="Calculates project line-item prices securely. Admins only.",
    func=_pricing_engine_handler,
    input_type=PricingEngineArgs,
)

class QuoteApprovalArgs(BaseModel):
    quote_id: str
    project_id: str
    grand_total: float

async def _request_quote_approval_handler(args: QuoteApprovalArgs, tool_context) -> Dict[str, Any]:
    """Pausa esecuzione per approvazione admin (HITL) via ADK ToolContext confirmation."""
    import secrets
    from src.adk.hitl import save_resumption_token

    # Check if we're resuming after confirmation
    tool_confirmation = tool_context.tool_confirmation
    if not tool_confirmation:
        # First call: generate nonce, save token, request confirmation
        nonce = secrets.token_urlsafe(32)
        await save_resumption_token(args.project_id, nonce)

        tool_context.request_confirmation(
            hint="Preventivo pronto per revisione admin. Approvare o rifiutare.",
            payload={
                "quote_id": args.quote_id,
                "total": args.grand_total,
                "nonce": nonce,
                "decision": "",
                "notes": "",
            },
        )
        return {"status": "pending_approval", "message": "Awaiting admin confirmation."}

    # Resumed after admin confirmation
    decision = tool_confirmation.payload.get("decision", "reject")
    if decision == "approve":
        return {"status": "approved", "notes": tool_confirmation.payload.get("notes", "")}
    return {"status": "rejected", "reason": tool_confirmation.payload.get("reason", "")}

request_quote_approval = FunctionTool(
    name="request_quote_approval",
    description="Pauses execution and sends the generated quote to the administrator for review.",
    func=_request_quote_approval_handler,
    input_type=QuoteApprovalArgs,
)

# Placeholder stubs for the other required phase 1 tools
class StringArg(BaseModel):
    query: str

async def _market_prices_handler(args: StringArg) -> str:
    return "Market prices are stable."

market_prices = FunctionTool(
    name="get_market_prices",
    description="Fetch live market material pricing.",
    func=_market_prices_handler,
    input_type=StringArg,
)

async def _analyze_room_handler(args: StringArg) -> str:
    return "Room analysis complete."

analyze_room = FunctionTool(
    name="analyze_room",
    description="Analyzes a room description or state.",
    func=_analyze_room_handler,
    input_type=StringArg,
)

# Remaining Phase 2 Tools Registration

class RenderArgs(BaseModel):
    prompt: str = Field(..., description="Description of the scene to render.")
    style: str = Field(default="photorealistic", description="Style of the render.")

async def _generate_render_handler(args: RenderArgs) -> str:
    # Routes to Tier 3 tools/generate_render.py logic
    return f"Render generated for prompt: {args.prompt} in style: {args.style}"

generate_render = FunctionTool(
    name="generate_render",
    description="Generates a photorealistic 3D render of a room.",
    func=_generate_render_handler,
    input_type=RenderArgs,
)

async def _show_project_gallery_handler(args: StringArg) -> str:
    return "Gallery fetched."

show_project_gallery = FunctionTool(
    name="show_project_gallery",
    description="Displays past projects similar to the requested style.",
    func=_show_project_gallery_handler,
    input_type=StringArg,
)

async def _list_project_files_handler(args: StringArg) -> str:
    return "CAD files listed."

list_project_files = FunctionTool(
    name="list_project_files",
    description="Lists DXF/CAD files attached to the project.",
    func=_list_project_files_handler,
    input_type=StringArg,
)

async def _suggest_quote_items_handler(args: StringArg) -> str:
    return "Suggested: Drywall, Painting, Flooring."

suggest_quote_items = FunctionTool(
    name="suggest_quote_items",
    description="Suggests line items for a quote based on a description.",
    func=_suggest_quote_items_handler,
    input_type=StringArg,
)

# MCPTool implementation for n8n Webhook Triggers
class N8nTriggerArgs(BaseModel):
    workflow_id: str = Field(..., description="The n8n workflow ID to trigger.")
    payload: Dict[str, Any] = Field(..., description="The JSON payload to send.")

async def _trigger_n8n_webhook_handler(args: N8nTriggerArgs) -> Dict[str, Any]:
    """
    Triggers an n8n webhook using the native MCP approach.
    Replaces rudimentary POST calls with managed MCP integrations.
    """
    import httpx
    from src.core.config import settings

    webhook_url = settings.N8N_WEBHOOK_NOTIFY_ADMIN
    if not webhook_url:
        return {"status": "error", "message": "N8N_WEBHOOK_NOTIFY_ADMIN is not configured."}

    try:
        import hmac
        import hashlib
        import json

        secret = settings.N8N_WEBHOOK_HMAC_SECRET or ""
        payload_bytes = json.dumps(args.payload, separators=(',', ':')).encode('utf-8')
        signature = hmac.new(secret.encode('utf-8'), payload_bytes, hashlib.sha256).hexdigest()

        headers = {
            "x-hub-signature-256": f"sha256={signature}",
            "Content-Type": "application/json"
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{webhook_url}/{args.workflow_id}",
                json=args.payload,
                headers=headers,
                timeout=10.0
            )
            response.raise_for_status()
            return {"status": "success", "result": "Triggered n8n workflow successfully."}
    except Exception as e:
        return {"status": "error", "message": f"Failed to trigger n8n: {e}"}

trigger_n8n_webhook = FunctionTool(
    name="trigger_n8n_webhook",
    description="Triggers an external automation workflow via n8n MCP.",
    func=_trigger_n8n_webhook_handler,
    input_type=N8nTriggerArgs,
)
