# 🧠 SYD Brain (Python Backend)

The core AI orchestration engine for the SYD Renovation Ecosystem.
Built with **FastAPI**, **LangGraph**, and **Google Gemini 2.5 Flash Lite**.

---

## 🚀 Key Features

- **Architecture:** Async-native FastAPI service optimized for high-performance Cloud Run deployments.
- **Guided Flows:** Advanced state tracking (`is_quote_completed`, `is_render_completed`) for cross-selling and journey management.
- **HITL Pipeline:** Human-in-the-Loop quote approval logic with automated PDF generation (WeasyPrint) and deliverable tracking.
- **n8n Connectivity:** Native MCP tools for Telegram/Email notifications and document delivery.
- **Vision Integration:** Automated room analysis and CAD extraction (Gemini 1.5 Pro).
- **Security:** Pydantic-based guardrails, RSA token verification, and strict **"Golden Sync"** schema enforcement.
- **Observability:** Structured JSON logging via `structlog` and per-request tracing (`X-Request-ID`).

## 🏛️ Operational Tiers (AI Graph Flow)

1. **Tier 1 (Directive):** `reasoning_node` - Generates a structured execution plan using **Gemini 2.5 Flash Lite**.
2. **Tier 2 (Orchestration):** `edges.py` - Deterministic state routing between reasoning, execution, and tools.
3. **Tier 3 (Execution):** `execution_node` & `custom_tools_node` - Direct tool invocation with atomic state reducers.

## 🛠️ Tech Stack

- **Runtime:** Python 3.12+
- **Manager:** `uv` (Rust-based, lightning fast)
- **Framework:** FastAPI / Pydantic V2
- **LLM Engine:** Vertex AI / Google GenAI (`google-genai` SDK)
- **Persistence:** Firebase Firestore with **Checkpointer Layer** (Stateful memory)
- **Config:** `pydantic-settings` for Type-Safe environment management

## 📦 Setup & Installation

### Installation
```bash
cd backend_python
uv sync
```

### Environment Variables (.env)
```ini
GOOGLE_CLOUD_PROJECT=chatbotluca-a8a73
FIREBASE_STORAGE_BUCKET=chatbotluca-a8a73.firebasestorage.app
N8N_WEBHOOK_NOTIFY_ADMIN=https://n8n.your-domain.it/webhook/...
N8N_WEBHOOK_DELIVER_QUOTE=https://n8n.your-domain.it/webhook/...
ENV=development
```

## ▶️ Running Locally

```bash
# Start server with hot reload
uv run uvicorn main:app --host 0.0.0.0 --port 8081 --reload
```

## 🧪 Testing & Quality
We enforce a strict testing policy for all core services.

```bash
# Run 172+ unit and integration tests
uv run pytest
```

## 📂 Project Structure

```
backend_python/
├── src/
│   ├── agents/            # Formalized SOPs (System Instructions)
│   ├── api/               # FastAPI Router endpoints
│   ├── core/              # Config, Schemas (Golden Sync), Exceptions
│   ├── graph/             # LangGraph Nodes, Edges, State (Checkpointers)
│   ├── repositories/      # Firestore / Firebase Admin access 
│   ├── services/          # Business Logic (Pricing, Admin, PDF)
│   ├── tools/             # AI Tools (Imagen, n8n, CAD, Perplexity)
│   └── vision/            # Multi-modal analysis modules
├── tests/                 # 172+ Unit & Integration tests
├── main.py                # App Initialization & Middleware
```

## 🔒 Security
- **JWT Verification**: Strict validation via `check_revoked=True`.
- **App Check**: Enforced on all non-health routes.
- **PII Protection**: Log argument redaction in `structlog`.

---
*Updated: March 1, 2026 — Phase 42*
