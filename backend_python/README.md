# 🧠 SYD Brain (Python Backend)

The core AI orchestration engine for the SYD Renovation Chatbot.
Built with **FastAPI**, **LangGraph**, and **Google Gemini 2.0 Flash**.

---

## 🚀 Key Features

- **Architecture:** Async-native FastAPI service optimized for Cloud Run.
- **Guided Flows:** State tracking logic (`is_quote_completed`, `is_render_completed`) for proactive cross-selling.
- **HITL Pipeline:** Human-in-the-Loop quote approval logic with automated PDF generation (WeasyPrint) and deliverable tracking.
- **n8n Connectivity:** Native MCP tools for Telegram/Email notifications and document delivery via n8n webhooks.
- **Vision Integration:** Automated room analysis and CAD extraction support (Wide-angle 0.5x optimization).
- **Security:** Pydantic-based guardrails, RSA token verification, and strict schema synchronization ("Golden Sync").
- **Latency Optimization:** "Hello" Gatekeeper bypassing heavy reasoning for simple greetings.
- **Observability:** Structured JSON logging via `structlog` and request tracing (`X-Request-ID`).

## 🏛️ Operational Tiers (Internal Flow)

1. **Tier 1 (Directive):** `reasoning_node` - Generates a structured plan (`ReasoningStep`) using Gemini 2.5 Flash.
2. **Tier 2 (Orchestration):** `edges.py` - Deterministic routing between reasoning, execution, and tools.
3. **Tier 3 (Execution):** `execution_node` & `custom_tools_node` - Tool invocation with journey flag updates (Reducers).

## 🛠️ Tech Stack

- **Runtime:** Python 3.12+
- **Manager:** `uv` (Rust-based, extremely fast)
- **Framework:** FastAPI
- **LLM:** Google GenAI SDK (`google-genai`)
- **Database:** Firebase Firestore (NoSQL)
- **Config:** `pydantic-settings` for robust environment management.

## 📦 Setup & Installation

### Prerequisites
- Python 3.12+
- `uv` installed (`pip install uv`)
- Google Cloud Credentials (`credentials.json`) in `backend_python/`

### Installation
```bash
cd backend_python
uv sync
```

### Environment Variables
Create a `.env` file in `backend_python/`:
```ini
GEMINI_API_KEY=AIzaSy...
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
GOOGLE_APPLICATION_CREDENTIALS=credentials.json
N8N_WEBHOOK_NOTIFY_ADMIN=https://n8n.your-instance.com/webhook/...
N8N_WEBHOOK_DELIVER_QUOTE=https://n8n.your-instance.com/webhook/...
N8N_API_KEY=your-n8n-key
ENV=development
```

## ▶️ Running Locally

```bash
# Start server with hot reload
uv run uvicorn main:app --host 0.0.0.0 --port 8080 --reload
```

## 🧪 Testing

We maintain high code coverage for critical paths.

```bash
# Run all tests
uv run pytest
```

## 📂 Project Structure

```
backend_python/
├── src/
│   ├── agents/            # SOP Manager & High-level logic
│   ├── api/               # FastAPI endpoints
│   ├── graph/             # Node & Edge definitions (The CoT Graph)
│   ├── models/            # Pydantic Schemas (Reasoning, State)
│   ├── prompts/           # Modular System Instructions
│   ├── repositories/      # Firestore/Data access isolation
│   ├── schemas/           # Pydantic models (Sync'd with Frontend TS)
│   ├── services/          # Business logic (AdminService, PricingService)
│   ├── tools/             # AI Tools (Imagen, n8n_mcp, Lead, etc.)
│   └── vision/            # Image/Video Analysis modules
├── tests/                 # Unit (Guards) & Integration tests
├── main.py                # App Entrypoint
```

## 🔒 Security & Privacy
- **Signed URLs:** Uploads generate short-lived signed links.
- **PII Redaction:** Sensitive details are obscured in log arguments before emission.
- **Zero-Trust:** Every protected endpoint validates RSA signatures from Firebase.

---

_Updated: Feb 24, 2026_
