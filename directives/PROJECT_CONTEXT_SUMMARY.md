- **Last Updated**: 2026-03-07T10:30:00Z
- **Current Version**: `v4.0.10` (Chronological Anchor & Tool Streaming)
- **Last Major Sync**: 2026-03-07
- **Status**: `Production-Ready — Inversion Fixed & Streaming Validated`
- **Next High Priority**: 1) Dynamic Robot Mascot | 2) Unify Dashboard Loaders (SydLoader) | 3) ADK Session cleanup cron (GDPR retention)

- **Phase 57 (Mar 07, 2026):** **Chronological Anchor & Tool Streaming (v4.0.10)**:
    - **Message Inversion Fix**: Implemented the "Chronological Anchor" by moving Firestore user message persistence to the FastAPI route handler (`main.py`) BEFORE initiating the `StreamingResponse`. This guarantees strictly sequential timestamps (User < Assistant).
    - **Tool Streaming**: Updated `ADKOrchestrator` to stop filtering tool events. It now properly streams `tool_call` and `tool_result` protocol chunks, fixing the issue where the bot appeared to stall during rendering.
    - **Visual Feedback**: Integrated `stream_status` triggers for prominent tools (e.g., "Syd sta generando il rendering...") to provide real-time UI feedback.
    - **Backend Stability**: Fixed a `NameError` in `main.py` related to `BackgroundTasks` that was blocking server reloads.
    - **ADK Hardening**: Improved `VertexAiSessionService` logging to track "Auth injection" visibility per request.

- **Phase 55 (Mar 06, 2026):** **Golden Sync & Data Validation (v4.0.6)**:
    - **Backend Strict Mode**: Injected `model_config = {"extra": "forbid"}` (or `"ignore"`) across all 64 Pydantic `BaseModel` classes to prevent Parameter Pollution. Added validation tests to `test_pydantic_guards.py` verifying HTTP 422 rejections.
    - **Frontend Zod Inference**: Replaced manual TypeScript interface definitions in `web_client/types/projects.ts` with `z.infer<typeof ...>` to guarantee 1:1 schema parity with the backend.
    - **API Hardening**: Implemented `fetchValidated` and `withValidation` wrappers in `lib/api-client.ts` to ensure runtime parsing of all API responses and Server Actions using Zod.

- **Phase 54 (Mar 06, 2026):** **Security Audit & Sandwich Defense Bypass Fix (v4.0.5)**:
    - **Prompt Injection Defense**: Fixed an architectural vulnerability in the "Sandwich Defense" implementation. Sanitizer now actively neutralizes `###` boundary markers in user input, and `ADKOrchestrator` explicitly wraps input in boundaries before passing to the model.
    - **Test Suite Modernization**: Migrated `test_gallery_tool.py`, `test_project_files_tool.py`, and `test_quote_routes.py` away from legacy LangGraph assertions towards the new ADK Architecture, fixing 15 failing tests. Now 178/178 backend tests pass.
    - **UI Enhancements**: Reduced biometric button shimmer/glow, activated passkey indicator in User Profile, and improved desktop Navbar alignment.

- **Phase 53 (Mar 06, 2026):** **Local Persistence & Latency Optimization (v4.0.4)**:
    - **Local Persistence Fix**: Integrated `ConversationRepository` into `ADKOrchestrator` to manually persist messages in local development (using `InMemorySessionService`).
    - **Sync Guard**: Added synchronization guard in `ChatProvider.tsx` to prevent message wiping during history sync.
    - **Latency (P0)**: User message persistence is now a non-blocking `asyncio.create_task`, improving TTFT.
    - **Latency (P0)**: Parallelized media URL fetching using `asyncio.gather` for multimodal requests.
    - **Latency (P1)**: Yielding immediate "thinking" status (`Syd sta analizzando...`) for instant UI feedback.
    - **Testing**: Updated `test_adk_orchestrator.py` to support background tasks and the new status chunk.

- **Phase 52 (Mar 05, 2026):** **Streaming Fix — BaseHTTPMiddleware Elimination (v4.0.3)**:
    - **Root Cause**: App Check middleware was the only one still using `@app.middleware("http")` (BaseHTTPMiddleware), which buffers the entire StreamingResponse body before forwarding — breaking real-time /chat/stream.
    - **Fix**: Converted to raw ASGI class `AppCheckMiddleware`, matching the pattern of all other 4 middlewares (RequestID, Metrics, SecurityHeaders, GlobalErrorCatcher).
    - **Content-Type Fix**: Changed backend StreamingResponse from `text/event-stream` to `text/plain` — body uses Data Stream Protocol v1 (`0:"text"\n`), not SSE.
    - **Docstring Fix**: Corrected adk_orchestrator.py docstring from "UI Message Stream SSE" to "Data Stream Protocol v1".

- **Phase 51 (Mar 04, 2026):** **ADK SSE Streaming & Protocol Alignment (v4.0.2)**:
    - **Streaming Optimization**: Enabled `StreamingMode.SSE` in ADK orchestrator to prevent monolithic 15s TTFB delays, sending chunks progressively.
    - **Protocol Alignment**: Fixed AI SDK v6 compatibility by setting `x-vercel-ai-data-stream: v1` headers across proxy and backend, ensuring Vercel Data Stream Protocol is parsed correctly.
    - **Network Buffering**: Disabled Next.js fetch caching (`cache: 'no-store'`) and set `X-Accel-Buffering: no` on the Python backend to ensure true real-time streaming to the client.

- **Phase 50 (Mar 04, 2026):** **Frontend Code Quality & ESLint Hardening (v4.0.1)**:
    - **TypeScript & React Hooks**: Eliminated all explicit `any` types, resolved all React Hook exhaustive-deps warnings, and fixed synchronous state updates in effects.
    - **Linting Milestone**: Achieved 100% clean lint state (0 errors, 0 warnings) across the entire Next.js frontend application.
    - **Code Cleanup**: Removed unused imports and variables, standardized icon imports (e.g., `ImageIcon` from `lucide-react`), and properly configured Radix UI primitives.

- **Phase 49 (Mar 03, 2026):** **Audit Plan D — Security & ADK Hardening (v4.0.0)**:
    - **Security & SSRF**: Fixed critical SSRF (H2, H3), Hardened n8n webhooks (H4), and enforced `verify_token` on all streaming paths (C2).
    - **Sanitization & Filtering**: Implemented multi-language prompt injection sanitizer (H1) and robust PII/Traceback output filtering (M2).
    - **Architecture**: Enforced singleton orchestrator (C1) and fixed HITL audit trail with dynamic `admin_uid` (M4).
    - **Testing**: Added 31 unit tests for ADK filters, session, and HITL (100% passing).
    - **Frontend**: Fixed `refreshHistory` state bug (F5) and masked sensitive error stacks in API proxy (M10).
    - **Monorepo Versioning**: Synchronized all packages to version `4.0.0`.


---

# PROJECT_CONTEXT_SUMMARY.md

**Current Version:** v4.0.10
**Last Updated:** 2026-03-07T10:30:00Z
**Project Phase:** Phase 57 - Chronological Anchor & Tool Streaming

---

### RECENT FIXES & UPDATES (v4.0.10)
1. **Chronological Anchor**: Moved user message saving to `main.py` BEFORE streaming, guaranteeing correct UI message order.
2. **Tool Streaming**: ADK results for rendering and pricing are now streamed in real-time, preventing bot silence.
3. **Visual Feedback**: Added "Syd sta generando..." status indicators for long-running AI tools.
4. **Reload Fix**: Fixed `NameError` in `main.py` to allow the backend to update correctly on code changes.
5. **Prompt Injection Defense**: (v4.0.5) Implemented robust Sandwich Defense by catching delimiter spoofing.
6. **Unit Tests Restored**: (v4.0.5) All 178/178 backend tests passing.

### Streaming Protocol (confirmed v4.0.3)
| Layer | Header | Format |
|-------|--------|--------|
| Backend (`stream_protocol.py`) | — | `0:"text"\n` (Data Stream v1) |
| Backend (`main.py`) | `x-vercel-ai-data-stream: v1`, `text/plain` | StreamingResponse |
| Proxy (`route.ts`) | `x-vercel-ai-data-stream: v1`, `text/plain` | Passthrough ReadableStream |
| Frontend (`ChatProvider.tsx`) | `DefaultChatTransport` auto-detect | `@ai-sdk/react@^3.0.5`, `ai@^6.0.39` |

### AI SDK v6 Patterns (ChatProvider.tsx)
- `useChat({ id, transport: new DefaultChatTransport({ api, headers }), onFinish, onError })`
- `sendMessage({ text: string }, { body })` — NOT `{ content, role }`
- `headers` and `body` can be async functions (`Resolvable`)
- `UIMessage` has `parts: [{type:'text', text:'...'}]` not `content: string`

### Known Gotchas
- **useSessionId() NOT for claim**: Priority 1 = `activeProjectId` (logged-in user). For claim use `localStorage.getItem('chatSessionId')` directly
- **Guest prefix**: Firestore guest `userId` starts with `guest_`. Firebase Anonymous Auth uses real UIDs — claim only works with `guest_` prefix
- **COOP warnings**: Harmless Chrome warning, fixable only with `signInWithRedirect`
- **"message channel closed"**: Chrome extensions, not our code

---

## ACTIVE PRIORITIES (Phase 47)

1. **Unify Dashboard Loaders**: Sostituire `Loader2` / spinner custom con `SydLoader` (M3 Expressive) e `DashboardSkeleton` — piano in `docs/PLANS/unify_dashboard_loaders.txt`.
2. **Dynamic Robot Mascot**: Animazioni contesto-aware per fase conversazione (TRIAGE/DESIGN/QUOTE).
3. **ADK Session Cleanup Cron**: GDPR retention — eliminare sessioni ADK più vecchie di N giorni.

## ORCHESTRATOR ARCHITECTURE (current — ADK-only)

```
FastAPI /chat/stream
    → get_orchestrator() → ADKOrchestrator (unico orchestratore)
        → Runner(app_name="syd_orchestrator", session_service=InMemorySessionService [singleton])
            → syd_orchestrator Agent
                ├── triage Agent (analyze_room, show_project_gallery)
                ├── design Agent (generate_render, list_project_files)
                └── quote Agent (pricing_engine, market_prices, suggest_quote_items,
                                 trigger_n8n_webhook, request_quote_approval HITL)
```

**LangGraph rimosso**: nessun fallback, nessun dual-mode.
**Tag archivio**: `langgraph-archive-pre-phase4` (recuperabile con `git checkout`)

## ADK Key Files

| File | Ruolo |
|------|-------|
| `src/adk/adk_orchestrator.py` | Runner wrapping, stream_chat, resume_interrupt, health_check |
| `src/adk/agents.py` | syd_orchestrator + 3 sub-agents |
| `src/adk/tools.py` | 9 FunctionTool registrati, delegano a Tier 3 |
| `src/adk/session.py` | VertexAiSessionService (prod) / InMemorySessionService (local) |
| `src/adk/filters.py` | sanitize_before_agent + filter_agent_output |
| `src/adk/hitl.py` | save/verify resumption token (Firestore) |
| `src/adk/drain.py` | drain_inflight_quotes() — drain LangGraph sessions pre-cutover |
| `src/services/orchestrator_factory.py` | CanaryOrchestratorProxy + get_orchestrator() |
| `src/services/base_orchestrator.py` | ABC interface |

## Security Status (all green)

| Finding | Stato |
|---------|-------|
| P0: Singleton Orchestrator (C1) | ✅ Fixed (v4.0.0) |
| P0: API Stream Auth (C2) | ✅ Fixed (v4.0.0) |
| P0: Media/Video SSRF (H2, H3) | ✅ Fixed (v4.0.0) |
| P0: Prompt Injection Bypass (LLM01) | ✅ Fixed (v4.0.5) |
| P1: n8n HMAC & Retry (H4) | ✅ Fixed (v4.0.0) |
| P1: Prompt Injection Sanitizer (H1) | ✅ Fixed (v4.0.0) |
| P1: Output/Traceback Filtering (M2) | ✅ Fixed (v4.0.0) |
| P1: HITL Audit Trail (M4) | ✅ Fixed (v4.0.0) |
| P1: Error Masking in SSE/Proxy (M1, M10) | ✅ Fixed (v4.0.0) |
| P2: ADK Test Coverage | ✅ 178 Units Passing |
| P2: GDPR EU region | ✅ ADK_LOCATION=europe-west1 |

## Test & Deployment Status

- **178/178 unit test passing**
- **Vercel builds**: ✅ Production-ready
  - Frontend type-check: 0 errors (npm run type-check)
  - npm audit: 0 vulnerabilities
  - pip-audit (backend): 0 vulnerabilities
- **ADK Architecture**: Fully migrated to Google ADK (Phase 4). [Audit Plan D](file:///c:/Users/User01/.gemini/antigravity/scratch/renovation-next/docs/PLANS/audit_plan_d_vertex_adk.md) security and architecture refinements applied:
  - **Singleton Pattern**: `ADKOrchestrator` is now a singleton to optimize resource usage.
  - **Authentication Enrollment**: `/chat/stream` now strictly enforces JWT verification via FastAPI dependencies.
  - **SSRF Hardening**: Implemented strict domain/bucket validation for multimodal media URLs and video URIs.
  - **Information Masking**: Internal error details are now suppressed in the SSE stream to prevent leakage.
- **Frontend**: Next.js 16 App Router + SWR. Mobile-first UX with custom swipe engine.
- **Recent fixes** (Session Mar 02-06):
  - **ADK Persona**: Restored full SYD identity and Italian language behavior by wiring modular prompts.
  - **Security (BOLA/IDOR)**: Audited and patched `/api/assets/delete` to strictly verify project ownership.
  - **Security (Prompt Injection)**: Fixed architectural boundary flaw replacing spoofed markers.
  - **Dashboard UX**: Made project action buttons always visible on mobile; fixed event bubbling.
  - **Navbar V2**: Implemented luxury gold glassmorphism and improved mobile menu ergonomics.

## Documentation

- `docs/PLAN_D_VERTEX_AI_NATIVE_ENTERPRISE.md` — Piano architetturale completo
- `docs/PHASE_3_CANARY_RUNBOOK.md` — Runbook operativo Phase 3
- `docs/PLANS/audit_plan_d_vertex_adk.md` — Audit plan and security status
- `docs/PLANS/PRODUCTION_AUDIT.md` — Definitive Pre-Flight Security Audit
- `docs/PLANS/unify_dashboard_loaders.txt` — Piano UI/UX prossimo task

_Documento aggiornato: Marzo 06, 2026 (Security Audit & Sandbox Defense Fix)_

