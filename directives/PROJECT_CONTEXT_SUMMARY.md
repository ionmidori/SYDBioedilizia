# PROJECT CONTEXT SUMMARY (v4.1.5)
**Ultimo aggiornamento:** 22 Marzo 2026 (Phase 81c)
**Status:** Production-Ready — GDPR Lifecycle + Architecture Canonicalized

## 🎯 Obiettivi Correnti (Phase 81c)
1. **GDPR Account Lifecycle**: 3-phase inactivity pipeline deployed. Cloud Scheduler (03:00 Europe/Rome), 3 Firestore composite indexes (READY), Secret Manager. Endpoint: `POST /internal/lifecycle/run`.
2. **Native RAG System**: Deployed Pinecone Serverless with Integrated Inference (`multilingual-e5-large`). Zero-latency retrieval for ADK agents without local embedding overhead.
3. **Activity Tracking**: `activity_tracker.py` debounced `last_active_at` on every authenticated request (1 write/hour/user).
4. **Mobile Swipe on PaneIndicator**: Framer Motion drag gesture on dots indicator (40px threshold, left/right swipe).
5. **Batch Admin Pages**: `2_📦_Progetto_Completo.py`, `batch_repo.py`, `batch_admin_service.py` committed.
6. **Architecture Canonicalized**: 1 stanza = 1 progetto, N progetti = 1 batch.

---

- **Phase 81d (Mar 22, 2026):** **Native RAG System — Pinecone Integrated Inference (v4.2.0)**:
    - **Integrated Inference**: Replaced `google-genai` local embedding logic with Pinecone Serverless native embedding (`multilingual-e5-large`).
    - **Backend**: Updated `RAGService` in `src/services/rag_service.py` and `retrieve_knowledge_wrapper` in `src/tools/rag_tools.py` to parse new serverless `result.hits.fields` structure.
    - **Ingestion**: Refactored `scripts/ingest_docs.py` to upsert raw text chunks. Populated `syd-knowledge` index (Namespace: `normative`).
    - **ADK Tool**: `retrieve_knowledge_adk` fully functional and verified with zero-latency retrieval.
    - **Status**: Production-Ready. Model: `gemini-2.5-flash-lite`. Commit ` pending`.

- **Phase 81c (Mar 22, 2026):** **Architecture Canonicalized — Remove Multi-Room-Per-Project (v4.1.5)**:
    - **Removed**: `room_analysis_service.py`, `aggregation_engine.py`, `room_routes.py` (6 REST endpoints), `suggest_multi_room_quote` ADK tool, `<multi_room_protocol>` from MODE_B prompt, `RoomQuote`/`RoomType` Pydantic+Zod models, `QuoteItem.room_id` field, `QuoteSchema.rooms/aggregation_adjustments/aggregated_subtotal` fields.
    - **Kept**: `AggregationAdjustment` model (used by batch advisory), `BatchAggregationEngine`, `aggregation_rules.json`.
    - **Architecture**: 1 stanza = 1 progetto, N progetti = 1 batch submission. Canonical and unambiguous.
    - **Status**: 0 TS errors, backend imports clean. Commit `2d12faf`.

- **Phase 81b (Mar 21, 2026):** **Mobile Swipe + Batch Admin Pages (v4.1.4)**:
    - **Mobile UX**: `PaneIndicator` in `MobileSwipeLayout.tsx` wraps dots in `motion.div` with `drag="x"` + `onDragEnd`. Swipe left/right 40px threshold navigates panes. `select-none` prevents text selection during drag.
    - **Batch Admin**: `2_📦_Progetto_Completo.py`, `seed_batch.py`, `batch_repo.py`, `batch_admin_service.py` committed to repo.
    - **Status**: Commit `ed3fec5`.

- **Phase 81a (Mar 21, 2026):** **GDPR 3-Phase Account Lifecycle (v4.1.3+)**:
    - **Pipeline**: `account_lifecycle_service.py` — Phase 1 (12mo→warning email), Phase 2 (13mo→Firebase Auth disabled), Phase 3 (24mo→PII anonymized + Auth deleted). All phases idempotent via `lifecycle_*_at` timestamps.
    - **Activity Tracking**: `activity_tracker.py` — debounced `last_active_at` Firestore write (1/hour per uid). Wired into `jwt_handler.py` as `schedule_touch(uid)` fire-and-forget.
    - **Endpoint**: `POST /internal/lifecycle/run` — X-Lifecycle-Secret header (constant-time compare). Returns `{status, warned, disabled, anonymized, errors}`.
    - **GCP**: Secret Manager (`syd-brain-lifecycle-secret`), Cloud Scheduler (`0 3 * * *` Europe/Rome, 3 retries, exp. backoff 30s-600s), 3 Firestore composite indexes (READY).
    - **Test**: `{"status":"ok","warned":0,"disabled":0,"anonymized":0,"errors":[]}` ✅
    - **Status**: Commit `a7ef2fe`. Endpoint live at Cloud Run URL.

- **Phase 80f (Mar 21, 2026):** **Inactivity Auth Bug Fix (v4.1.3)**:
    - Fixed 2 bugs: stale session not cleared on inactivity logout + anonymous users incorrectly flagged as authenticated.
    - **Status**: Commit `aef268f`.

- **Phase 80d (Mar 20, 2026):** **Live ADK Evaluation Runner Infrastructure (v4.1.3)**:
    - **Eval Scripts**: npm targets added: `eval:run` (all sets), `eval:run:quote/triage/design` (per-flow). CLI: `uv run python tests/evals/run_evals.py [--file FILE] [--agent AGENT] [--output DIR]`.
    - **Infrastructure**: `tests/evals/results/` directory created + added to `.gitignore` (live runs not tracked). 5 test.json files: 3 flows (quote, triage, design) + 2 supplementary designs = 5 eval cases total.
    - **Validation Complete**: `test_eval_infrastructure.py` 13/13 passing. `syd_rubrics.py` all rubrics instantiate (NO_FURNITURE, ITALIAN_ONLY, HAS_MQ, SKU_PRESENT, etc.). `test_config.json` with `tool_trajectory_avg_score` IN_ORDER criterion validates correctly.
    - **Ready for Live**: `GOOGLE_API_KEY` ✅, `gemini-3.1-flash-lite-preview` judge model ✅, agent module resolution ✅. Can run: `npm run eval:run` (requires API quota).
    - **Status**: Commit `5a7d92b`.

- **Phase 80c (Mar 20, 2026):** **Mobile Scroll Hardening + N8N Webhook Security (v4.1.2)**:
    - **Mobile Scroll**: `DashboardClientLayout` min-h-screen → min-h-[100dvh] (iOS address bar fix). `globals.css`: add `overscroll-behavior-y: none` to prevent pull-to-refresh bounce. Define `.custom-scrollbar` (was referenced but undefined).
    - **N8N Webhook Validation**: Inbound HMAC-SHA256 verification via `verify_n8n_webhook` FastAPI dependency. Fail-secure (503 if secret unconfigured). Replay protection (±5min window). POST /webhooks/n8n endpoint with idempotency dedup. Optional X-N8N-API-KEY header.
    - **Infrastructure**: Exclude `/webhooks/n8n` from App Check middleware (n8n has no Firebase SDK). 9 unit tests all passing.
    - **Status**: Commit `680c038`. Production Audit: 51/51 complete (CSRF webhook item now done).

- **Phase 80b (Mar 20, 2026):** **Backend Cold Start Optimization (v4.1.1)**:
    - **O1 (main.py)**: Lifespan warm-up cambiato da blocking `await run_in_threadpool()` a `asyncio.create_task()`. `/health` disponibile in ~4s vs ~23s. Task salvato su `app.state.warmup_task`, cancellato su shutdown.
    - **O2 (firebase_client.py)**: Lazy-import `firebase_admin.firestore` e `.storage` dentro le factory functions. Defer `google.api_core` protobuf chain (~2s) al primo accesso effettivo.
    - **O3 (orchestrator_factory.py)**: Lazy-import `ADKOrchestrator` dentro `_create_orchestrator()` + double-checked locking con `threading.Lock`. Import time 2.8s → 0.003s. `TYPE_CHECKING` guard per type annotations.
    - **Test fix (test_core_modules.py)**: Patch target aggiornato a `src.adk.adk_orchestrator.ADKOrchestrator` (definition site). 448/448 tests passing.
    - **Status**: Commit `0fcb460` — non ancora pushato.

- **Phase 80a (Mar 20, 2026):** **Admin Approval Dashboard & Multi-Project Optimization (v4.1.0)**:
    - **Backend (Batches Logic)**: Creati `BatchRepository` e `BatchAdminService` in `admin_tool/src`. Logic for `QuoteBatch` (gruppi di progetti) con calcolo risparmi.
    - **UI (Progetto Completo)**: Implementata `2_📦_Progetto_Completo.py` in Streamlit. Vista unificata per risparmi cross-project e approvazione granulare dei singoli siti.
    - **Infrastructure & Fixes**: Installata dipendenza `reportlab` e corretto bug `st.column_config.BadgeColumn` (sostituito con `TextColumn`).
    - **Terminology**: Rinominato "Batches" in "Progetto Completo" per allineamento al linguaggio business.
    - **Status**: Dashboard operativa su porta 8506. Commit `e7b9a5c`.

- **Phase 79 (Mar 18, 2026):** **Full CVE Remediation — Dependabot Closed (v4.0.33)**:
    - **Backend (pip-audit: 0 vulnerabilities)**: authlib 1.6.8→1.6.9, pyasn1 0.6.2→0.6.3, pyjwt 2.11.0→2.12.1, pyopenssl 25.3.0→26.0.0.
    - **Frontend (npm audit exit 0)**: next 16.1.6→16.2.0 in `web_client/package.json` + `package.json` root.
    - **Status**: Status 0 vulnerabilità High/Critical raggiunto. Commit `1a7eb8a`.

- **Phase 78 (Mar 18, 2026):** **Security Remediation & Dependency Hardening (v4.0.32)**:
    - **Backend (0 Vulnerabilities)**: Rimossi `langgraph`, `langchain` e pacchetti non conformi Phase 4. Aggiornati `pyjwt`, `pypdf`, `authlib`, `pyasn1`, `pyopenssl` e `tornado`.
    - **Frontend (Secure Core)**: `npm audit fix --force`. Aggiornati `firebase-admin@latest`, `@vercel/analytics@latest` e `@vercel/speed-insights@latest`.
    - **Status**: Dipendenze certificate per produzione.

- **Phase 77 (Mar 18, 2026):** **Repository Audit & Standard Compliance (v4.0.31)**:
    - **Git Repo Cleanup**: Rimossi oltre 25 file "junk" (log dumps, debug texts, test temporanei) erroneamente tracciati nel repository e presenti nel filesystem locale.
    - **Professional Integrity**: Allineamento della repository root agli standard enterprise di Next.js/FastAPI.
    - **Status**: Codebase pulita e professionale.

- **Phase 76 (Mar 18, 2026):** **Skills Registry Audit & Animation Infrastructure (v4.0.30)**:


---

- **Current Version**: `v4.1.5`
- **Production Audit Status**: 51/51 items complete ✅ All production audit items implemented
- **Security Status**: Backend 0 CVEs (`pip-audit`). Frontend: 0 High/Critical/Moderate (`npm audit` exit 0). GDPR lifecycle + N8N HMAC-SHA256 complete.
- **Test Coverage**: Backend 461 passing, Frontend 0 TS errors.
- **GDPR Status**: 3-phase lifecycle deployed ✅. Cloud Scheduler active. Firestore indexes READY.
- **Architecture**: 1 stanza = 1 progetto → N progetti → 1 batch (canonical, no legacy multi-room per project).
- **Next High Priority**: 1) Run live evals (5 cases, 3 agents) | 2) Scroll animations on landing page | 3) Deploy Batch UI to Production Cloud Run

