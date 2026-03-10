---
paths:
  - "backend_python/**/*.py"
---

# Backend Architecture (Python/FastAPI)

## 3-Tier Flow (CRITICAL)
Frontend -> Backend -> ADK Orchestrator is the ONLY flow. Never bypass tiers.

## Key Entry Points
- `main.py` -> `/chat/stream` streaming endpoint
- `src/adk/adk_orchestrator.py` wraps `google.adk.runners.Runner`
- `src/adk/agents.py` — triage / design / quote sub-agents + syd_orchestrator router
- `src/adk/tools.py` — 9 async FunctionTools (session_id required for all)
- `src/adk/session.py` — InMemorySessionService (ephemeral; history injected from Firestore on restart)

## Middleware Stack (execution order)
1. Request ID injection (`request_id_middleware`)
2. Metrics tracking (`middleware/metrics.py`)
3. App Check validation (`middleware/app_check.py`)
4. Security headers (`middleware/security_headers.py`)

## Code Conventions
- **Pydantic V2**: Use `model_config`, `Field(alias=...)`, `model_dump()`
- **Logging**: Use structured logger from `core/logger.py` (auto-injects request ID)
- **Errors**: Raise `AppException` (from `core/exceptions.py`) with error codes
- **Async**: Prefer `async def` for I/O. Wrap sync Firebase SDK calls in `run_in_threadpool()` or `asyncio.to_thread()`
- **No inline imports**: All imports at module top-level unless resolving circular deps

## Firebase Schema ("Golden Sync")
MUST maintain 1:1 parity between Pydantic (Python) and TypeScript interfaces.
- `users/{uid}`, `projects/{projectId}`, `sessions/{sessionId}/messages`, `leads/{leadId}`
- Row-level security on `userId` field (all writes require auth)

## Testing (Pytest)
- `asyncio_mode = "auto"` in pyproject.toml
- Use `pytest-mock` for Firebase Admin SDK, Vertex AI calls
- Markers: `integration` for live API tests
- ALWAYS mock in `jest.setup.js` for frontend tests — JSDOM cannot run real Firebase SDK

## Security
- JWT via `src/auth/jwt_handler.py`
- Firebase App Check on all routes except `/health`
- CORS whitelist for Vercel deployments — update `main.py` for new domains

## ADK Settings (.env)
- `ORCHESTRATOR_MODE=vertex_adk`
- `ADK_LOCATION=europe-west1` (GDPR)
