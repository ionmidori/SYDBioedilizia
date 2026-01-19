# 🧠 SYD Brain (Python Backend)

The core AI orchestration engine for the SYD Renovation Chatbot.
Built with **FastAPI**, **LangGraph**, and **Google Gemini 2.5**.

---

## 🚀 Features

- **Architecture:** Async-native FastAPI service deployed on Cloud Run.
- **AI Engine:** Recursive logic managed by `LangGraph` for robust state management.
- **Vision Capabilities:** Uses `gemini-2.5-flash` for high-speed image triage and renovation analysis.
- **Image Generation:** Google Imagen 3 pipeline with architect-driven prompting.
- **Security:**
  - **Auth:** JWT-based authentication (Validates Firebse ID Tokens / Internal Handshake).
  - **File Access:** Uses Signed URLs (v4) for secure, temporary image sharing (7-day expiry).
  - **Audit:** Passed Security Audit V2 (PII protection, no public ACLs).
- **Quota System:**
  - **Anonymous:** 1 render/day.
  - **Authenticated:** 3 renders/day (managed via Firestore).
- **CI/CD:** Automated testing pipeline using GitHub Actions (100% Code Coverage).

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
│   ├── agents/            # LangGraph workflows
│   ├── api/               # FastAPI endpoints
│   ├── auth/              # JWT & Security
│   ├── db/                # Firestore DAO
│   ├── graph/             # Node & Edge definitions
│   ├── prompts/           # System Instructions
│   ├── storage/           # GCS/Upload Logic
│   ├── tools/             # AI Tools (Imagen, Triage, etc.)
│   └── vision/            # Image Analysis modules
├── tests/                 # Unit & Integration tests
├── main.py                # App Entrypoint
├── pyproject.toml         # Dependencies
└── uv.lock                # Pinned versions
```

## 🔒 Security Notes
- **Signed URLs:** Uploads generate `https://storage.googleapis.com/...` signed links valid for 7 days.
- **Logging:** Sensitive info (like URL signatures) is redacted in logs.
- **Dependencies:** `uv.lock` ensures reproducible and secure builds.

---

_Updated: Jan 18, 2026_
