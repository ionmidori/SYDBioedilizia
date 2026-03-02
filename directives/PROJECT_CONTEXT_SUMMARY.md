- **Last Updated**: 2026-03-02T15:00:00Z
- **Current Version**: `v3.9.0` (Phase 4: LangGraph Decommissioning Complete)
- **Last Major Sync**: 2026-03-02
- **Status**: `Production-Ready — ADK-only, LangGraph fully decommissioned`
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
**Last Updated:** 2026-03-02T13:28:00Z
**Project Phase:** Phase 46.2 - ADK 100% Live (Maintenance & Vercel Fixes)

---

## RECENT FIXES (v3.8.24)
1. **Vercel Deployment Fix**: Removed `output: "standalone"` from Next.js config to resolve Vercel deployment "Internal error". 
2. **Next.js 16 Proxy Migration**: Migrated `middleware.ts` to `proxy.ts` (conforming to Next.js 16 deprecation standards).

---

## ACTIVE PRIORITIES (Phase 47)

1. **Unify Dashboard Loaders**: Sostituire `Loader2` / spinner custom con `SydLoader` (M3 Expressive) e `DashboardSkeleton` — piano in `docs/PLANS/unify_dashboard_loaders.txt`.
2. **Dynamic Robot Mascot**: Animazioni contesto-aware per fase conversazione (TRIAGE/DESIGN/QUOTE).
3. **ADK Session Cleanup Cron**: GDPR retention — eliminare sessioni ADK più vecchie di N giorni.

## ORCHESTRATOR ARCHITECTURE (current — ADK-only)

```
FastAPI /chat/stream
    → get_orchestrator() → ADKOrchestrator (unico orchestratore)
        → Runner(app_name="syd_orchestrator", session_service=FirestoreSessionService)
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

- **172/172 unit test passing** (`pytest tests/unit/`)
- Test isolamento settings: `Settings(_env_file=None, ...)` per default check
- **Vercel builds**: ✅ Production-ready (commit c60c789)
  - Frontend type-check: 0 errors (npm run type-check)
  - npm audit: 0 vulnerabilities (fast-xml-parser + minimatch patched in commit 7ad26d5)
  - pip-audit (backend): 0 vulnerabilities
- **Recent fixes** (Session Mar 02):
  - Auth: Fixed `AuthDialog` bug where it stayed open after successful Google login/claim error.
  - Navbar: Implemented golden glassmorphism style for all main menu items (desktop & mobile).
  - Navbar Mobile UX V2: Lowered MENU title, enforced uniform padding/width for Area Personale button, applied luxury glassmorphism identical to dashboard, unified profile card layout to stretch full width with integrated logout button.
  - Navbar UI: Centered and enlarged "Menu" title, moved User Profile & Logout below FAQ with 44px spacing.
  - Navbar UI: Increased mobile menu background transparency (bg-luxury-bg/80) and set Logout icon color to red-500.
  - Gallery page: fixed mobile layout pushing images to bottom by removing hardcoded 500px heights when not virtualized.
  - Gallery page: AdvancedLightbox centered images vertically across all devices while maintaining 90vw/85vh breathing margins.
  - profile/page.tsx TypeScript errors (result.error → message, PasskeyButton mode prop)
  - Image domain SSRF hardening (wildcard → project-specific domains)

## Documentation

- `docs/PLAN_D_VERTEX_AI_NATIVE_ENTERPRISE.md` — Piano architetturale completo
- `docs/PHASE_3_CANARY_RUNBOOK.md` — Runbook operativo Phase 3
- `docs/PLANS/unify_dashboard_loaders.txt` — Piano UI/UX prossimo task
- `SESSION_RECAP.md` — Recap dettagliato sessione 4

_Documento aggiornato: Marzo 02, 2026 (Session: Navbar Mobile UX V2 & Glassmorphism)_
