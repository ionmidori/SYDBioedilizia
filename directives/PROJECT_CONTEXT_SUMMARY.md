- **Last Updated**: 2026-03-03T22:40:00Z
- **Current Version**: `v4.0.0` (ADK Hardening & Security Audit — Complete)
- **Last Major Sync**: 2026-03-03
- **Status**: `Production-Ready — Security Multi-Agent Audit Passed`
- **Next High Priority**: 1) Unify Dashboard Loaders (SydLoader) | 2) Dynamic Robot Mascot | 3) ADK Session cleanup cron (GDPR retention)

- **Phase 49 (Mar 03, 2026):** **Audit Plan D — Security & ADK Hardening (v4.0.0)**:
    - **Security & SSRF**: Fixed critical SSRF (H2, H3), Hardened n8n webhooks (H4), and enforced `verify_token` on all streaming paths (C2).
    - **Sanitization & Filtering**: Implemented multi-language prompt injection sanitizer (H1) and robust PII/Traceback output filtering (M2).
    - **Architecture**: Enforced singleton orchestrator (C1) and fixed HITL audit trail with dynamic `admin_uid` (M4).
    - **Testing**: Added 31 unit tests for ADK filters, session, and HITL (100% passing).
    - **Frontend**: Fixed `refreshHistory` state bug (F5) and masked sensitive error stacks in API proxy (M10).
    - **Monorepo Versioning**: Synchronized all packages to version `4.0.0`.


---

# PROJECT_CONTEXT_SUMMARY.md

**Current Version:** v4.0.0
**Last Updated:** 2026-03-03T22:40:00Z
**Project Phase:** Phase 49 - Audit Plan D (Security & ADK Hardening)

---

## RECENT FIXES & UPDATES (v3.8.24)
1. **Audit Plan D Completion**: Implemented all security, architectural, and frontend fixes from `docs/PLANS/audit_plan_d_vertex_adk.md`.
2. **SSRF & Webhook Hardening**: Strictly validated all inbound media and outbound webhooks in ADK.
3. **Prompt Injection Sanitizer**: Multi-language (IT/EN) sanitizer implemented in `src/utils/data_sanitizer.py`.
4. **Information Leakage Prevention**: Masked error stacks and internal paths in SSE and Proxy responses.
5. **ADK Testing Milestone**: Zero test coverage addressed with 31 new passing unit tests for core ADK logic.

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
| P1: n8n HMAC & Retry (H4) | ✅ Fixed (v4.0.0) |
| P1: Prompt Injection Sanitizer (H1) | ✅ Fixed (v4.0.0) |
| P1: Output/Traceback Filtering (M2) | ✅ Fixed (v4.0.0) |
| P1: HITL Audit Trail (M4) | ✅ Fixed (v4.0.0) |
| P1: Error Masking in SSE/Proxy (M1, M10) | ✅ Fixed (v4.0.0) |
| P2: ADK Test Coverage | ✅ 31 Units Passing |
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
