# PROJECT CONTEXT SUMMARY (v4.1.2)
**Ultimo aggiornamento:** 20 Marzo 2026 (Phase 80)
**Status:** Production-Ready — Scroll Hardening + N8N Webhook Security Complete

## 🎯 Obiettivi Correnti (Phase 80)
1. **Mobile Scroll Fixed**: iOS address bar handling (`100dvh`), overscroll prevention, `.custom-scrollbar` defined.
2. **N8N Webhook Security**: HMAC-SHA256 inbound validation, idempotency, fail-secure (503 if unconfigured).
3. **Backend Performance Optimized**: Non-blocking warm-up + lazy imports. `/health` in ~4s vs ~23s.
4. **Admin Approval UI**: Dashboard "Progetto Completo" in Streamlit per revisione multisito.
5. **CVE Remediation**: Stato 0 vulnerabilità High/Critical mantenuto.

---

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

- **Current Version**: `v4.1.2`
- **Production Audit Status**: 51/51 items complete ✅ All production audit items implemented
- **Security Status**: Backend 0 CVEs (`pip-audit`). Frontend: 0 High/Critical/Moderate (`npm audit` exit 0, `audit-level=moderate`). N8N HMAC-SHA256 webhook auth hardening complete.
- **Test Coverage**: Backend 457 passing (+9 webhook auth), Frontend 0 TS errors.
- **Next High Priority**: 1) Scroll animations on landing page | 2) Live eval run `uv run python tests/evals/run_evals.py` | 3) Multi-room aggregation phase | 4) Deploy Batch UI to Production Cloud Run

