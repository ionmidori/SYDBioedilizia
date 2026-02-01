# 🧠 SYD Brain (Python Backend)

The core AI orchestration engine for the SYD Renovation Chatbot.
Built with **FastAPI**, **LangGraph**, and **Google Gemini 2.5**.

---

## 🚀 Features

- **Architecture:** Async-native FastAPI service deployed on Cloud Run.
- **Architecture:** 3-Tier Python-First Chain of Thought (CoT) orchestration.
- **AI Engine:** Explicit reasoning steps managed by Gemini 2.0 Flash + LangGraph.
- **Fail-Fast Security:** Pydantic-based guardrails in `src/models/reasoning.py` to validate intent before execution.
- **RBTA (Role-Based Tool Access):** Dynamic tool visibility managed by `SOPManager` (e.g., Auth-gated rendering).
- **Vision Capabilities:** High-speed triage and renovation analysis via automated tool routing.
- **Latency Optimization:** "Hello" Gatekeeper bypassing heavy reasoning for simple greetings.

## 🏛️ Internal Tiers

1. **Tier 1 (Directive):** `reasoning_node` - Generates a structured plan (`ReasoningStep`).
2. **Tier 2 (Orchestration):** `edges.py` - Deterministic routing based on plan validation.
3. **Tier 3 (Execution):** `execution_node` & `SOPManager` - Hard enforcement of business rules and tool invocation.

## 🛠️ Tech Stack

- **Runtime:** Python 3.12+
- **Manager:** `uv` (Rust-based, extremely fast)
- **Framework:** FastAPI
- **LLM:** Google GenAI SDK (`google-genai`)
- **Database:** Firebase Firestore (NoSQL)
- **Storage:** Firebase Storage (GCS)

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
INTERNAL_JWT_SECRET=your-secret-here
ENV=development
```

## ▶️ Running Locally

```bash
# Start server with hot reload
uv run uvicorn main:app --host 0.0.0.0 --port 8080 --reload
```

## 🧪 Testing

We maintain **100% Code Coverage** for critical paths.

```bash
# Run all tests
uv run pytest

# Run with coverage report
uv run pytest --cov=src --cov-report=term-missing
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
│   ├── tools/             # AI Tools (Imagen, Auth, Lead, etc.)
│   └── vision/            # Image/Video Analysis modules
├── tests/                 # Unit (Guards) & Integration tests
├── main.py                # App Entrypoint
```

## 🔒 Security Notes
- **Signed URLs:** Uploads generate `https://storage.googleapis.com/...` signed links valid for 7 days.
- **Logging:** Sensitive info (like URL signatures) is redacted in logs.
- **Dependencies:** `uv.lock` ensures reproducible and secure builds.

---

_Updated: Jan 18, 2026_
