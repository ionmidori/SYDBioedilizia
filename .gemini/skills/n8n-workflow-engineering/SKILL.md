---
name: n8n-workflow-engineering
description: Design and orchestrate n8n workflows with FastAPI webhook integration. Use when building automation workflows, connecting n8n to the SYD backend, or designing data transformation pipelines.
---

# n8n Workflow Engineering

Patterns for designing n8n workflows that integrate with the SYD FastAPI backend via webhooks.

## Architecture

```
n8n Workflow ──webhook──► FastAPI Backend ──► Firestore / ADK
                              │
FastAPI Backend ──HTTP────► n8n Workflow (trigger automation)
```

**Two directions:**
- **Inbound**: n8n calls FastAPI endpoints (HTTP Request node → REST API)
- **Outbound**: FastAPI triggers n8n (see `n8n-mcp-integration` skill)

## Workflow Design Patterns

### 1. Webhook Trigger + Validation

Always validate immediately after the webhook node:

```
Webhook → Filter Node (validate payload) → Process → Respond
```

The Filter node rejects malformed requests before processing — prevents partial execution.

### 2. Data Transformation

- Use `{{ $json.field }}` for simple field access
- Use **Code Node** (JavaScript) for complex transforms instead of chaining multiple Set/IF nodes
- Ensure field paths match the Pydantic model on the FastAPI side (Golden Sync applies)

### 3. Error Handling

Every production workflow needs:
- **Error Trigger** node connected to notification (email/Slack)
- **Retry** logic on HTTP Request nodes (3 retries, exponential backoff)
- Idempotency keys for payment/email workflows (prevent double-send)

## FastAPI Integration Contract

n8n HTTP Request nodes must match FastAPI Pydantic models:

```python
# backend_python/src/models/webhook.py
class N8NWebhookPayload(BaseModel):
    event_type: str
    project_id: str
    data: dict[str, Any]
```

The n8n HTTP Request node sends JSON matching this schema. Backend validates with `safeParse` equivalent (Pydantic).

## Security

- Webhook endpoints require HMAC-SHA256 signature verification
- Use `X-N8N-Signature` header with shared secret
- Never expose internal n8n URLs to the frontend (3-tier rule)

## Best Practices

- **Idempotency**: Handle retries safely (especially payments, emails, Firestore writes)
- **Timeouts**: Set HTTP Request node timeout to 30s (match Cloud Run request timeout)
- **Logging**: Include execution ID in all webhook payloads for traceability
- **Testing**: Use n8n's "Test Workflow" with sample payloads before connecting live

## Checklist

- [ ] Webhook has Filter node for payload validation
- [ ] Error Trigger connected to notification channel
- [ ] HTTP Request nodes have retry + timeout configured
- [ ] Pydantic model matches n8n JSON output (Golden Sync)
- [ ] HMAC signature verification on webhook endpoint
