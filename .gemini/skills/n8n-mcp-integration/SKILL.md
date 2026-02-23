---
name: n8n-mcp-integration
description: Integrates FastAPI backend with n8n automation workflows via webhook calls. Covers notify_admin and deliver_quote tools, n8n webhook trigger setup, retry logic with tenacity, and MCP Server Trigger node configuration. Use when implementing workflow automation, admin notifications, quote delivery, or any fire-and-forget automation triggered from the Python backend.
---

# n8n MCP Integration: FastAPI → n8n Webhooks

**Pattern**: FastAPI (Tier 3) calls n8n webhook URLs to trigger automations.
n8n handles: email, Telegram, WhatsApp, Notion, CRM, etc.

For tool implementation: see `src/tools/n8n_mcp_tools.py`

---

## Architecture: 2 Integration Modes

### Mode A: FastAPI → n8n (our pattern)
FastAPI sends HTTP POST to n8n Webhook Trigger → n8n automates delivery.

```
[LangGraph Tool] → httpx.post(N8N_WEBHOOK_URL) → [n8n Workflow] → Email/Telegram/etc.
```

### Mode B: n8n as MCP Server (advanced)
n8n exposes tools to AI agents via MCP Server Trigger node. Useful for future AI-to-n8n tool calling.

---

## n8n Setup (Mode A — Webhook Trigger)

1. In n8n, create a new workflow
2. Add **"Webhook"** node as first node (not MCP Server Trigger)
3. Set **HTTP Method** = POST, **Response Mode** = "Respond Immediately"  
4. Copy the **Webhook URL** (e.g. `https://your-n8n.app.n8n.cloud/webhook/abc123`)
5. Add to `.env`:

```bash
# .env (backend_python)
N8N_WEBHOOK_NOTIFY_ADMIN=https://your-n8n.app.n8n.cloud/webhook/abc123
N8N_WEBHOOK_DELIVER_QUOTE=https://your-n8n.app.n8n.cloud/webhook/def456
N8N_API_KEY=your_n8n_api_key          # Optional, for prod auth
ADMIN_DASHBOARD_URL=http://localhost:8501
```

## n8n Workflow: Notify Admin

Suggested node sequence in n8n:
```
[Webhook] → [Switch: urgency] → [Email: Send] + [Telegram: Send Message]
                               → also → [Notion: Create Database Item]
```

Payload received by n8n (sent from `notify_admin` tool):
```json
{
  "event": "quote_ready_for_review",
  "project_id": "proj_abc123",
  "estimated_value": 4250.00,
  "client_name": "Mario Rossi",
  "urgency": "high",
  "review_url": "http://localhost:8501/quotes/proj_abc123"
}
```

## n8n Workflow: Deliver Quote

Payload received by n8n (sent from `deliver_quote` tool):
```json
{
  "event": "quote_approved_deliver",
  "project_id": "proj_abc123",
  "client_email": "cliente@example.com",
  "pdf_url": "https://storage.googleapis.com/...",
  "quote_total": 4250.00,
  "delivery_channel": "email"
}
```

Suggested node sequence:
```
[Webhook] → [Switch: delivery_channel]
              ├─ email → [Gmail: Send Email with PDF attachment]
              ├─ whatsapp → [Twilio: Send WhatsApp]
              └─ both → [Gmail] + [Twilio]
```

## n8n MCP Server Mode (Mode B — Future)

For AI-to-n8n direct tool calling (2025 feature):

1. Install `n8n-nodes-mcp` community node in self-hosted n8n
2. Add **"MCP Server Trigger"** as first node in workflow
3. n8n generates an **SSE URL** → AI agent connects to it
4. AI can discover and call n8n workflows as tools

```python
# Future: Connect AI agent to n8n as MCP client
# Use this when n8n exposes complex, stateful workflows as tools
mcp_server_url = "https://your-n8n.app.n8n.cloud/mcp/sse"
```

> For this project's current architecture, Mode A (webhooks) is sufficient and simpler. Mode B is recommended when n8n workflows become complex tool-like operations that benefit from MCP discovery.

## Security: Production Checklist

- [ ] Set `N8N_API_KEY` and verify it in webhook header
- [ ] In n8n: activate "Header Auth" credential check on the Webhook node
- [ ] Use HTTPS-only webhook URLs (never HTTP in production)
- [ ] Add webhook URL to `ALLOWED_WEBHOOK_HOSTS` allowlist if implementing inbound webhooks
