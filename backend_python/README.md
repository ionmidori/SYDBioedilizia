# 🧠 SYD Brain (Python Backend)

The core AI orchestration engine for the SYD Renovation Ecosystem.
Built with **FastAPI**, **Google ADK (Vertex AI Agent Builder)**, and **Google Gemini 2.5 Flash**.

---

## 🚀 Key Features

- **Architecture:** Async-native FastAPI service optimized for high-performance Cloud Run deployments.
- **Multi-Agent Orchestration:** Fully migrated to Google ADK with a factory-pattern routing layer (`syd_orchestrator`).
- **Guided Flows:** Advanced state tracking (`is_quote_completed`, `is_render_completed`) for cross-selling and journey management.
- **Session Hardening:** Robust recovery mechanisms for transient Firestore and Vertex AI Session errors during active streams.
- **HITL Pipeline:** Human-in-the-Loop quote approval logic with automated PDF generation (WeasyPrint) and deliverable tracking.
- **Feedback & Evaluation:** Native feedback collection (`/feedback` API) and an integrated offline ADK Evaluation Suite.
- **n8n Connectivity:** Native tools for Telegram/Email notifications and document delivery.
- **Vision Integration:** Automated room analysis and CAD extraction (Gemini 1.5 Pro).
- **Security:** Pydantic-based guardrails, strict App Check enforcement, SSRF protections, and **"Golden Sync"** schema matching.
- **Observability:** Structured JSON logging via `structlog` and per-request tracing (`X-Request-ID`).

## 🏛️ Operational Tiers (ADK Flow)

1. **Tier 1 (Orchestration):** `syd_orchestrator` - Main router agent evaluating the phase (Triage, Design, Quote) with an Intent-First approach.
2. **Tier 2 (Specialized Agents):** Sub-agents handling intent-specific logic using native tools (`triage_agent`, `design_agent`, `quote_agent`).
3. **Tier 3 (Execution):** `src/adk/tools.py` - 100% Type-Safe tool invocations with `FunctionTool` wrappers interfacing directly with Core Services.

## 🛠️ Tech Stack

- **Runtime:** Python 3.12+
- **Manager:** `uv` (Rust-based, lightning fast)
- **Framework:** FastAPI / Pydantic V2
- **LLM Engine:** Vertex AI / Google ADK v1.26 (`google-genai` SDK)
- **Persistence:** Firebase Firestore via `VertexAiSessionService`
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
We enforce a strict testing policy for all core services, including offline evaluation logic.

```bash
# Run 400+ unit, integration, and evaluation tests
uv run pytest
```

## 📂 Project Structure

```
backend_python/
├── src/
│   ├── adk/               # Google ADK Orchestration, Agents, Tools, Filters
│   ├── api/               # FastAPI Router endpoints (Feedback, Auth, etc.)
│   ├── core/              # Config, Schemas (Golden Sync), Exceptions
│   ├── repositories/      # Firestore / Firebase Admin access
│   ├── services/          # Business Logic (Pricing, Admin, PDF)
│   ├── tools/             # Legacy standalone tools (Perplexity, etc.)
│   └── vision/            # Multi-modal analysis modules (`google.genai` native)
├── tests/                 # Unit, Integration & Eval tests
│   └── evals/             # ADK Offline evaluation logic
├── main.py                # App Initialization & Middleware
```

## 🔒 Security
- **JWT Verification**: Strict validation via `verify_token` dependencies.
- **App Check**: Enforced on all non-health routes.
- **Prompt Injection Defense**: Native `data_sanitizer` to block jailbreak attempts.
- **PII Protection**: Output filtering & Log argument redaction in `structlog`.

---
*Updated: March 14, 2026 — Phase 71 (v4.0.24)*

