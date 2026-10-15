# SYD Brain (Python backend)

SYD Brain is the FastAPI service behind the SYD Bioedilizia platform. It streams
the AI chat (Server-Sent Events), hosts the Google ADK agents, exposes the REST
API used by the website and the admin console, and owns all access to Firebase,
Pinecone, Vertex AI and email delivery. The frontend never talks to those
services directly.

## What the service does

- **Chat streaming**: `POST /chat/stream` runs the ADK `Runner` with token
  streaming (`StreamingMode.SSE`) and records per-turn latency (`chat_turn_timing`).
- **Multi-agent orchestration**: the `syd_orchestrator` router delegates to the
  `triage`, `design` and `quote` sub-agents (`src/adk/agents.py`). The agents
  share 14 async `FunctionTool` functions (`src/adk/tools.py`); every
  session-scoped tool takes its user and session from the ADK `tool_context`,
  never from arguments chosen by the model.
- **Quotes**: draft quotes are built from the internal price book and the
  Prezzario Regione Lazio 2023 (RAG on Pinecone). An admin reviews and approves
  each quote; approved quotes are rendered to PDF with ReportLab and delivered
  by email.
- **Vision**: room, floor plan and video analysis with Gemini (`src/vision/`).
- **Renders**: photorealistic renders with per-user quotas.
- **Transactional email outbox**: notifications and quote delivery are written
  together with the business change and dispatched through Brevo or SMTP, with
  retries, dead-lettering and Brevo delivery events (`src/services/email/`).
  Dispatch is event-driven on Cloud Tasks. A dead-lettered email logs
  `email_dead_letter`, which triggers an alert email to the admin.
- **Admin API**: quote review, batches, price book, portfolio, testimonials,
  KPIs and GDPR tools (`src/api/routes/admin_*.py`).
- **Guardrails**: always-on input sanitizer plus optional Google Cloud Model
  Armor on the agents' input and output.

## Request flow

The ADK layer is reached only through the backend:

```text
Browser → Next.js (/api/chat proxy or /api/py/* rewrite) → FastAPI → ADK Runner → tools
```

`main.py` registers the middleware as raw ASGI layers, because
`BaseHTTPMiddleware` would buffer the SSE stream. From outermost to innermost:

1. `RequestIDMiddleware`: `X-Request-ID` on every response, errors included.
2. `SecurityHeadersMiddleware`: security headers on every response.
3. `CORSMiddleware`: outside App Check and the error catcher, so their 403 and
   500 responses carry `Access-Control-Allow-Origin` and a browser can read the
   error envelope.
4. `GlobalErrorCatcherMiddleware`: JSON envelope for anything that escapes.
5. `AppCheckMiddleware`: Firebase App Check on every route except the public
   ones (health probes, two public read-only content GETs and the internal
   endpoints, which have their own authentication).
6. `IdempotencyMiddleware`: replays cached responses for duplicate
   `Idempotency-Key` POSTs.
7. `MetricsMiddleware`.

Two tests pin this order and the error contract:
`tests/unit/test_middleware_order.py` and `tests/unit/test_api_error_contract.py`.

Health endpoints: `/health`, `/api/health`, `/ready` and `/health/startup`
(the Cloud Run startup probe, answered after the background warm-up).

## Tech stack

| Area | Technology |
| :--- | :--- |
| Runtime | Python 3.12 or later (the Docker image uses 3.14), managed with [`uv`](https://docs.astral.sh/uv/) |
| Framework | FastAPI, Starlette, Pydantic v2, `pydantic-settings`, `slowapi` |
| AI | Google ADK 2.x, Gemini through `google-genai` |
| RAG | Pinecone with integrated inference (`multilingual-e5-large`) and reranker (`bge-reranker-v2-m3`) |
| Data and auth | Firebase Admin (Firestore, Storage, Auth), App Check, WebAuthn passkeys (`fido2`) |
| Documents and email | ReportLab (PDF), Brevo or SMTP (`aiosmtplib`) |
| Observability | JSON logs with request IDs, Cloud Trace spans, log-based metrics and alerts |

Models are resolved by role in `src/core/models.py` from the settings in
`src/core/config.py`; no other module may contain a `gemini-` literal (a guard
test enforces it). Defaults: `gemini-3.5-flash-lite` for the agents,
`gemini-3.8-flash` for vision and media turns, and
`gemini-3.1-flash-image-preview` for renders. In production the Gemini backend
is Vertex AI on the `eu` multi-region (see [`deploy/README.md`](deploy/README.md)).

## Sessions

The ADK `InMemorySessionService` is ephemeral. Cloud Run session affinity keeps
a conversation on the instance that holds its state, and after a restart the
history is injected again from Firestore.

## Setup

Run the commands from `backend_python/` unless noted.

1. Install the dependencies, including the test tools:

   ```bash
   uv sync --extra dev
   ```

2. Copy `.env.example` to `.env` and fill in the values. `main.py` calls
   `load_dotenv(".env")` before any `google-adk` import: don't reorder it.

3. Start the server (from the repository root, `npm run dev:py` does the same):

   ```bash
   uv run uvicorn main:app --reload --port 8080
   ```

## Tests and quality gates

```bash
uv run pytest                      # about 1,200 tests, no network or live API
uv run ruff check src/ main.py tests/
uv run pyright                     # config in pyrightconfig.json
uv run pip-audit --strict --desc --ignore-vuln CVE-2026-28277
```

The ADK agent evaluations call the live Gemini API and need `GOOGLE_API_KEY`:
`npm run eval:run` from the repository root. See
[`tests/README.md`](tests/README.md) and [`tests/evals/README.md`](tests/evals/README.md).

## Project structure

```text
backend_python/
├── main.py              # App, middleware stack, router registration
├── src/
│   ├── adk/             # Agents, tools, orchestrator, plugins, session service
│   ├── api/routes/      # REST routers (chat history, projects, quotes, admin_*, email, ...)
│   ├── auth/            # Firebase ID token verification
│   ├── core/            # Settings, model registry, logger, exceptions, tracing
│   ├── data/            # Seed data (price book)
│   ├── db/              # Firestore access (projects, quotes, users, messages)
│   ├── middleware/      # App Check, idempotency, metrics, security headers
│   ├── models/          # Domain models
│   ├── prompts/         # Prompt components composed by adk/agents.py
│   ├── repositories/    # Repository layer
│   ├── schemas/         # Request/response schemas (Golden Sync with web_client/types)
│   ├── services/        # Pricing, PDF, RAG, batches, email outbox, Model Armor, ...
│   ├── storage/         # Cloud Storage helpers
│   ├── tools/           # Tool implementations used by src/adk/tools.py
│   ├── utils/           # Sanitizer, download, JSON parsing, stream protocol, ...
│   └── vision/          # Gemini vision pipelines (analysis, architect, triage, video)
├── deploy/              # Cloud Run, email outbox, Vertex AI and observability scripts
├── scripts/             # Manual maintenance and ingestion scripts (see scripts/README.md)
└── tests/               # unit/, integration/, evals/
```

## Conventions

- **Golden Sync**: a change to a Pydantic model needs the matching TypeScript
  interface in `web_client/types/`, and the other way around.
- Wrap synchronous Firebase SDK calls in `run_in_threadpool()` or
  `asyncio.to_thread()` inside async code.
- Raise `AppException` (`src/core/exceptions.py`) for API errors; use the
  structured logger from `src/core/logger.py`.
- Put all imports at the top of the module.

## Security

- Firebase ID tokens are verified with revocation checks
  (`src/auth/jwt_handler.py`).
- App Check is enforced on every non-public route.
- User input is sanitized (`src/utils/data_sanitizer.py`); Model Armor adds a
  second, optional layer.
- Logs redact emails, phone numbers and tokens before they're written.

See [`SECURITY.md`](../SECURITY.md) for the full policy and how to report a
vulnerability.
