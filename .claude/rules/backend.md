---
paths:
  - "backend_python/**/*.py"
---

# Backend Architecture (Python/FastAPI)

## 3-Tier Flow (CRITICAL)
Frontend -> Backend -> ADK Orchestrator is the ONLY flow. Never bypass tiers.

## Key Entry Points
- `main.py` -> `/chat/stream` streaming endpoint (token streaming; per-turn latency logged as `chat_turn_timing`, see `src/core/chat_timing.py`)
- Gemini model IDs: ONLY in `src/core/config.py`, resolved by role via `src/core/models.py` (a guard test fails on any `"gemini-` literal elsewhere)
- `src/adk/adk_orchestrator.py` wraps `google.adk.runners.Runner`
- `src/adk/agents.py` — triage / design / quote sub-agents + syd_orchestrator router
- `src/adk/tools.py` — 18 FunctionTools (room tools `select_room` / `assign_media_to_room` / `rename_room` / `get_room_context`, Phase 138); session-scoped tools take `session_id` and trust it only via `_trusted_session_id`. No tool may call an external automation endpoint (n8n removed: quote emails go through the outbox, `src/services/email/outbox.py`). A quote is sent only by the "Invia al team" button (`POST /api/quote/{id}/submit`, `src/services/quote_submission.py`): the agent registers it with `suggest_quote_items` and never sends it (card-recap flow, 27 Nov); no quote batches (removed in Phase 138 PR-4)
- `src/adk/session.py` — InMemorySessionService (ephemeral; history injected from Firestore on restart, with the room index, the active room's brief and `[Foto id · Stanza]` labels)
- `src/adk/app_factory.py` — the one ADK App (plugins, history compaction, optional explicit context cache), shared by the orchestrator and the multi-room evals; history compaction only after a turn (`PostTurnCompactionPlugin` turns off ADK's compaction before each model call, which would delay the first token and could summarize away the current user message) and `SydRunner` runs it in the background (`src/adk/compaction.py`, summary organized by room)
- `src/adk/session_context.py` — agents' prompts are `static_instruction` (stable prefix for Gemini's cache); the "CONTESTO SESSIONE" block is their `instruction`, sent by ADK as the last content before the user turn. Guardrails and plugins read the turn's message from `callback_context.user_content`, never "the last user content"
- `src/services/room_brief.py` — room brief (scheda stanza) refreshed in the background after a turn with new facts (`ModelRole.SUMMARIZER`); never on the reply path
- `src/services/room_photo_vision.py` — when `select_room` makes a room active, its reference photo is measured and each other photo compared with it (one call each), in the background; stored as `RoomSchema.photo_estimate` (backend-only), reused by the quote for the same photo and shown in the brief as "stima da foto"
- `src/services/quote_proposal.py` — when the team has the quote ("relay"), `suggest_quote_items` still analyses the change (specs not saved, quote not written) and `quote_followup.relay_tx` stores it as an AI revision proposal (`private_data/quote_proposal`, replaced per request) in the same transaction; the admin email carries its range, the dossier returns it (`QuoteDossier.proposal`)

## Middleware Stack (outermost → innermost)
Registered in ONE block in `main.py` ("Middleware stack"); `add_middleware()` is LIFO.
1. `RequestIDMiddleware` — X-Request-ID on every response (errors included)
2. `SecurityHeadersMiddleware` (`middleware/security_headers.py`)
3. `CORSMiddleware` — outside App Check/catcher, so their 403/500 carry `Access-Control-Allow-Origin` (#482)
4. `GlobalErrorCatcherMiddleware` — JSON envelope for anything that escapes
5. `AppCheckMiddleware` (`middleware/app_check.py`)
6. `IdempotencyMiddleware` (`middleware/idempotency.py`)
7. `MetricsMiddleware` (`middleware/metrics.py`)
All raw ASGI (never `BaseHTTPMiddleware`: it buffers `/chat/stream`). Order guarded by
`tests/unit/test_middleware_order.py`; error contract by `test_api_error_contract.py`.

## Code Conventions
- **Pydantic V2**: Use `model_config`, `Field(alias=...)`, `model_dump()`
- **Logging**: Use structured logger from `core/logger.py` (auto-injects request ID)
- **Errors**: Raise `AppException` (from `core/exceptions.py`) with error codes
- **Async**: Prefer `async def` for I/O. Wrap sync Firebase SDK calls in `run_in_threadpool()` or `asyncio.to_thread()`
- **No inline imports**: All imports at module top-level unless resolving circular deps
- **BLE001 ratchet**: never add a new `# noqa: BLE001`; narrow existing ones when touching a module (canonical policy: `pyproject.toml`, ruff section)
- **Brand (quote emails, PDF)**: colours only as semantic roles through `src/core/brand.py` (`BRAND.color("<role>")`), generated from `web_client/brand` by `npm run brand:build` into `src/brand/`; never a hex or a ReportLab named colour (guard: `tests/unit/test_brand.py`)
- **Money**: amounts are `Decimal` through `src/core/money.py` (`Money` field type, `line_total` / `compute_totals` / `sum_amounts` / `to_cents`, ROUND_HALF_UP to the cent) and stay JSON numbers in Firestore and the API. Never `round(…, 2)` or float arithmetic on an amount (guard: `tests/unit/test_money_guard.py`). Same rule as `web_client/lib/money.ts`, pinned by `contracts/money/golden_vectors.json` (regenerate with `scripts/generate_money_vectors.py`)

## Firebase Schema ("Golden Sync")
MUST maintain 1:1 parity between Pydantic (Python) and TypeScript interfaces.
- `users/{uid}`, `projects/{projectId}`, `sessions/{sessionId}/messages`, `leads/{leadId}`
- Row-level security on `userId` field (all writes require auth)

## Testing (Pytest)
- `asyncio_mode = "auto"` in pyproject.toml
- Use `pytest-mock` for Firebase Admin SDK, Vertex AI calls
- Markers: `integration` for live API tests
- ALWAYS mock in `jest.setup.js` for frontend tests — JSDOM cannot run real Firebase SDK

## Dependencies (uv — read before touching pyproject.toml)
- `backend_python` is **uv-managed**: `pyproject.toml` declares floors, `uv.lock` is
  what the Docker image installs. **A floor bump without a re-lock ships nothing.**
- Always `uv lock` after editing `pyproject.toml`, and commit `uv.lock` in the same PR.
  CI enforces this (`uv lock --check` in `backend-tests.yml`).
- `--locked` ≠ `--frozen`. `--frozen` only means "do not update the lock" and accepts a
  stale one **silently**; `--locked` asserts lock/pyproject are in sync and fails otherwise.
  Use `--locked` everywhere (Dockerfile, CI) — see PR #291 for the incident this prevents.
- Dependabot must use `package-ecosystem: "uv"` for this directory, never `"pip"`
  (`pip` rewrites only the floors and leaves `uv.lock` untouched).

## Security
- JWT via `src/auth/jwt_handler.py`
- Firebase App Check on all routes except `/health`
- CORS whitelist for Vercel deployments — update `main.py` for new domains

## ADK Settings (.env)
- `ORCHESTRATOR_MODE=vertex_adk`
- `ADK_LOCATION` does NOT select the Gemini region (only a tracing label). The Gemini backend is chosen by the
  google-genai client from `GOOGLE_GENAI_USE_VERTEXAI` / `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION`;
  production uses `GOOGLE_CLOUD_LOCATION=global` (since 2026-11-20: `eu` is 10-20x slower for gemini-3.8-flash, but keeps data in the EU; europe-west1 does not serve Gemini 3.x) — see `deploy/gemini-vertex-eu.sh`
