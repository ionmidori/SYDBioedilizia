- **Last Updated**: 2026-03-02T18:00:00Z
- **Current Version**: `v3.9.1` (ADK Chatbot Fix — SessionNotFoundError + GOOGLE_API_KEY)
- **Last Major Sync**: 2026-03-02
- **Status**: `Production-Ready — ADK-only, chatbot locale funzionante`
- **Next High Priority**: 1) Unify Dashboard Loaders (SydLoader) | 2) Dynamic Robot Mascot | 3) ADK Session cleanup cron (GDPR retention)

- **Phase 46.2 (Mar 01, 2026):** **ADK 100% Rollout + API Compat Fixes (v3.8.21)**:
    - **ORCHESTRATOR_MODE=vertex_adk**: Backend ora instrada il 100% del traffico su ADKOrchestrator. Singolo sviluppatore → skip canary graduale.
    - **google-adk 1.26 breaking changes risolti**:
        - `from google.adk import types` → `from google.genai import types`
        - `FirestoreSessionService` rimossa → `VertexAiSessionService(project, location)` + `InMemorySessionService()` fallback locale
        - `FunctionTool(name=, func=, input_type=)` → `FunctionTool(func)` (nome da function name, desc da docstring)
        - `Runner(agent=)` → `Runner(app_name="syd_orchestrator", agent=, session_service=)`
    - **ADK Tools wired to Tier 3**: 9 tools collegati a `PricingService`, `InsightEngine`, `generate_render`, `market_prices`, `gallery`, `project_files`, `suggest_quote_items`, n8n webhook
    - **Drain utility**: `src/adk/drain.py` + `scripts/drain_check.py` — 0 sessioni HITL pendenti verificato
    - **172/172 unit test passing**

- **Phase 48 (Mar 02, 2026):** **ADK Chatbot Fix (v3.9.1)**:
    - **SessionNotFoundError risolto**: `get_session_service()` era non-singleton → Runner e `stream_chat` usavano istanze diverse di `InMemorySessionService`. Fix: singleton con `_session_service_instance` globale in `src/adk/session.py`.
    - **GOOGLE_API_KEY risolto**: `google-adk` internamente cerca `GOOGLE_API_KEY` in `os.environ`. Pydantic-settings non inietta variabili sconosciute del `.env`. Fix: `load_dotenv(".env")` come prima riga di `main.py`.
    - **Modelli deprecati corretti**: `gemini-3.0-flash-preview` → `gemini-2.5-flash` in `agents.py`, `triage.py`, `video_triage.py`.
    - **Chatbot locale verificato funzionante** (risposta `CHUNK: '0:"Ciao!..."'`)

- **Phase 47 (Mar 02, 2026):** **Phase 4: LangGraph Decommissioning COMPLETE (v3.9.0)**:
    - **Rimosso**: `src/graph/`, `src/agents/`, `src/services/agent_orchestrator.py`
    - **Rimosso da pyproject.toml**: `langchain`, `langchain-core`, `langchain-google-genai`, `langchain-google-vertexai`, `langgraph`, `langgraph-checkpoint-firestore`
    - **Migrato**: `vision/*.py` e `services/insight_engine.py` da `ChatGoogleGenerativeAI` a `google.genai` nativo
    - **Migrato**: tutti i `tools/*.py` — rimossi decorator `@tool`/`StructuredTool` LangChain
    - **Semplificato**: `orchestrator_factory.py` — `CanaryOrchestratorProxy` rimosso, ritorna `ADKOrchestrator()` direttamente
    - **Tag git**: `langgraph-archive-pre-phase4` conserva tutto il codice rimosso
    - **Poi**: Dashboard Loaders unification (SydLoader), Dynamic Robot Mascot

---

# PROJECT_CONTEXT_SUMMARY.md

**Current Version:** v3.8.24
**Last Updated:** 2026-03-02T16:00:00Z
**Project Phase:** Phase 46.2 - ADK 100% Live (Maintenance & Vercel Fixes)

---

## RECENT FIXES & UPDATES (v3.8.24)
1. **Punti Deboli Plan**: Creato `docs/PLANS/Punti deboli.md` per tracciare le criticità post-Phase 4 (latenza streaming ADK, Golden Sync manuale, cleanup sessioni, frammentazione Loader UI, test E2E e rate limiting).
2. **Vercel Deployment Fix**: Removed `output: "standalone"` from Next.js config to resolve Vercel deployment "Internal error". 
3. **Next.js 16 Proxy Migration**: Migrated `middleware.ts` to `proxy.ts` (conforming to Next.js 16 deprecation standards).

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
| P0: Auth/RBAC quote routes | ✅ Fixed (commit 35d1f8d) |
| P1: n8n HMAC signing | ✅ Fixed (commit 35d1f8d) |
| P1: Pricing qty bounds | ✅ Fixed (commit 35d1f8d) |
| P1: Image domain hardening (SSRF prevention) | ✅ Fixed (commit c60c789) |
| P2: Input/Output filtering | ✅ src/adk/filters.py |
| P2: Admin resumption token | ✅ src/adk/hitl.py |
| P2: GDPR EU region | ✅ ADK_LOCATION=europe-west1 |

## Test & Deployment Status

- **172/172 unit test passing**
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
- **Recent fixes** (Session Mar 02-03):
  - **ADK Persona**: Restored full SYD identity and Italian language behavior by wiring modular prompts.
  - **Security (BOLA/IDOR)**: Audited and patched `/api/assets/delete` to strictly verify project ownership.
  - **Gallery UX**: Restored missing image deletion functionality and fixed vertical centering in Lightbox.
  - **Dashboard UX**: Made project action buttons always visible on mobile; fixed event bubbling.
  - **Navbar V2**: Implemented luxury gold glassmorphism and improved mobile menu ergonomics.

## Documentation

- `docs/PLAN_D_VERTEX_AI_NATIVE_ENTERPRISE.md` — Piano architetturale completo
- `docs/PHASE_3_CANARY_RUNBOOK.md` — Runbook operativo Phase 3
- `docs/PLANS/audit_plan_d_vertex_adk.md` — Audit plan and security status
- `docs/PLANS/unify_dashboard_loaders.txt` — Piano UI/UX prossimo task

_Documento aggiornato: Marzo 03, 2026 (Audit Plan D Refinements — Security & Architecture)_
