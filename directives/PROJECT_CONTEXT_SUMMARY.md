- **Last Updated**: 2026-03-01T22:00:00Z
- **Current Version**: `v3.8.2` (ADK 100% Live — LangGraph Decommission Ready)
- **Last Major Sync**: 2026-03-01
- **Status**: `Production-Ready — ORCHESTRATOR_MODE=vertex_adk (100% ADK)`
- **Next High Priority**: 1) Phase 4: Decommissioning LangGraph | 2) Unify Dashboard Loaders (SydLoader) | 3) Dynamic Robot Mascot

- **Phase 46.2 (Mar 01, 2026):** **ADK 100% Rollout + API Compat Fixes (v3.8.2)**:
    - **ORCHESTRATOR_MODE=vertex_adk**: Backend ora instrada il 100% del traffico su ADKOrchestrator. Singolo sviluppatore → skip canary graduale.
    - **google-adk 1.26 breaking changes risolti**:
        - `from google.adk import types` → `from google.genai import types`
        - `FirestoreSessionService` rimossa → `VertexAiSessionService(project, location)` + `InMemorySessionService()` fallback locale
        - `FunctionTool(name=, func=, input_type=)` → `FunctionTool(func)` (nome da function name, desc da docstring)
        - `Runner(agent=)` → `Runner(app_name="syd_orchestrator", agent=, session_service=)`
    - **ADK Tools wired to Tier 3**: 9 tools collegati a `PricingService`, `InsightEngine`, `generate_render`, `market_prices`, `gallery`, `project_files`, `suggest_quote_items`, n8n webhook
    - **Drain utility**: `src/adk/drain.py` + `scripts/drain_check.py` — 0 sessioni HITL pendenti verificato
    - **172/172 unit test passing**

- **Phase 47 (Next):** **Phase 4: LangGraph Decommissioning (v3.8.3+)**:
    - **Gate**: ADK stabile in produzione per almeno 1 settimana (sviluppatore solo → pochi giorni di test sufficienti)
    - **Azioni**: Rimuovere `src/graph/`, `src/repositories/conversation_repository.py`, `langgraph*` da `pyproject.toml`
    - **Poi**: Dashboard Loaders unification (SydLoader), Dynamic Robot Mascot

---

# PROJECT_CONTEXT_SUMMARY.md

**Current Version:** v3.8.2
**Last Updated:** 2026-03-01T22:00:00Z
**Project Phase:** Phase 46.2 - ADK 100% Live

---

## ACTIVE PRIORITIES (Phase 46.2)

1. **Phase 4: Decommissioning LangGraph**: Rimozione codice legacy dopo verifica stabilità ADK in produzione (target: 2026-03-08 se nessun errore).
2. **Unify Dashboard Loaders**: Sostituire `Loader2` / spinner custom con `SydLoader` (M3 Expressive) e `DashboardSkeleton` — piano in `docs/PLANS/unify_dashboard_loaders.txt`.
3. **Dynamic Robot Mascot**: Animazioni contesto-aware per fase conversazione (TRIAGE/DESIGN/QUOTE).

## ORCHESTRATOR ARCHITECTURE (current)

```
FastAPI /chat/stream
    → CanaryOrchestratorProxy (ORCHESTRATOR_MODE=vertex_adk)
        → ADKOrchestrator (100% traffico)
            → Runner(app_name="syd_orchestrator", session_service=VertexAiSessionService)
                → syd_orchestrator Agent
                    ├── triage Agent (analyze_room, show_project_gallery)
                    ├── design Agent (generate_render, list_project_files)
                    └── quote Agent (pricing_engine, market_prices, suggest_quote_items,
                                     trigger_n8n_webhook, request_quote_approval HITL)
    → LangGraphOrchestrator (fallback: se ADK health_check() == False)
```

**Rollback istantaneo**: `ORCHESTRATOR_MODE=langgraph` in `.env` + restart

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
| P2: Input/Output filtering | ✅ src/adk/filters.py |
| P2: Admin resumption token | ✅ src/adk/hitl.py |
| P2: GDPR EU region | ✅ ADK_LOCATION=europe-west1 |

## Test Status

- **172/172 unit test passing** (`pytest tests/unit/`)
- Test isolamento settings: `Settings(_env_file=None, ...)` per default check

## Documentation

- `docs/PLAN_D_VERTEX_AI_NATIVE_ENTERPRISE.md` — Piano architetturale completo
- `docs/PHASE_3_CANARY_RUNBOOK.md` — Runbook operativo Phase 3
- `docs/PLANS/unify_dashboard_loaders.txt` — Piano UI/UX prossimo task
- `SESSION_RECAP.md` — Recap dettagliato sessione 4

_Documento aggiornato: Marzo 01, 2026_
