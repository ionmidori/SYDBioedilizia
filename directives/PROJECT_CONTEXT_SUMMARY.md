# PROJECT CONTEXT SUMMARY (v4.3.1)
**Ultimo aggiornamento:** 23 Marzo 2026 (Phase 82b)
**Status:** Production-Ready — Admin Dashboard + Portfolio Cloud Run Live

## 🎯 Obiettivi Correnti (Phase 82b)
1. **Admin Console Live**: Streamlit admin tool deployato su Cloud Run (`syd-admin`, europe-west1). Dashboard KPI, Preventivi, Portfolio, Recensioni, GDPR Monitor, Listino Prezzi — tutte le sezioni operative.
2. **Portfolio Full-Cycle**: Admin carica immagini → Firebase Storage → Firestore `portfolio_projects` → `Portfolio.tsx` legge da Firestore con fallback agli hardcoded defaults.
3. **Native RAG System**: Deployed Pinecone Serverless with Integrated Inference (`multilingual-e5-large`). Zero-latency retrieval for ADK agents without local embedding overhead.
4. **GDPR Account Lifecycle**: 3-phase inactivity pipeline deployed. Cloud Scheduler (03:00 Europe/Rome), 3 Firestore composite indexes (READY), Secret Manager. Endpoint: `POST /internal/lifecycle/run`.
5. **Architecture Canonicalized**: 1 stanza = 1 progetto, N progetti = 1 batch.

---

- **Phase 82b (Mar 23, 2026):** **Portfolio Admin Page + Cloud Run Deploy (v4.3.1)**:
    - **Portfolio Admin**: `pages/5_🖼️_Portfolio.py` con routing list/add/edit, thumbnail preview, visibility toggle, upload immagini Firebase Storage (Admin SDK direct upload → `make_public()` → permanent URL).
    - **Service Layer**: `portfolio_repo.py` (Firestore CRUD su `portfolio_projects`) + `portfolio_service.py` (upload + CRUD).
    - **Frontend Sync**: `Portfolio.tsx` aggiornato: `PortfolioItem` type, hover state `string | number | null`, `useEffect` che carica da Firestore (active==true, ordinati per order) con fallback silenzioso ai progetti hardcoded.
    - **Firestore Rules**: Regola `portfolio_projects` (public read) aggiunta e deployata via Firebase CLI.
    - **Cloud Run**: `admin_tool/Dockerfile` (single-stage, python:3.12-slim, ADC, porta 8080) + `.dockerignore`. Deployato su `syd-admin-repo` AR (repo dedicata per evitare SLSA attestation bug su `cloud-run-source-deploy`). Live: https://syd-admin-972229558318.europe-west1.run.app

- **Phase 82 (Mar 23, 2026):** **Admin Image Upload & Storage Infrastructure (v4.3.0)**:
    - **Backend (Storage)**: Introduced `StorageService` in `src/services/storage_service.py` for v4 Signed URL generation. Created `POST /api/v1/admin/storage/signed-url` protected route.
    - **Frontend (UI)**: Created `AdminImageUpload.tsx` component with `react-dropzone` and client-side WebP compression (`browser-image-compression`).
    - **Integration**: Added "Nuova Foto" action button and M3-style upload modal to `GlobalGalleryContent.tsx` in the Next.js dashboard.
    - **Environment**: Fixed `LIFECYCLE_SECRET` typo and duplicate `INTERNAL_JWT_SECRET` in `.env.local`.
    - **Status**: Production-ready. Verified via `pytest` and health checks.

- **Phase 81e (Mar 22, 2026):** **Mobile UI Polish & UX Hardening (v4.2.1)**:
    - **Chat UI**: Fixed drag constraints on `ChatToggleButton` to prevent the button from being dragged off-screen.
    - **Safe Area Insets**: Implemented `env(safe-area-inset-*)` directly via CSS to respect mobile notches/home indicators.
    - **WelcomeBadge**: Realined the message bubble position closer to the avatar to look more organic.
    - **Firebase Stability**: Applied `experimentalAutoDetectLongPolling` and `try/catch` block for Firestore initialization in Next.js 16.2.0 Turbopack to prevent `[code=unavailable]` WebSocket disconnections during Fast Refresh.

- **Phase 81d (Mar 22, 2026):** **Native RAG System — Pinecone Integrated Inference (v4.2.0)**:
    - **Integrated Inference**: Replaced `google-genai` local embedding logic with Pinecone Serverless native embedding (`multilingual-e5-large`).
    - **Backend**: Updated `RAGService` in `src/services/rag_service.py` and `retrieve_knowledge_wrapper` in `src/tools/rag_tools.py` to parse new serverless `result.hits.fields` structure.
    - **Ingestion**: Refactored `scripts/ingest_docs.py` to upsert raw text chunks. Populated `syd-knowledge` index (Namespace: `normative`).
    - **ADK Tool**: `retrieve_knowledge_adk` fully functional and verified with zero-latency retrieval.
    - **Status**: Production-Ready. Model: `gemini-2.5-flash-lite`.

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


---

- **Current Version**: `v4.3.1`
- **Production Audit Status**: 51/51 items complete ✅ All production audit items implemented
- **Security Status**: Backend 0 CVEs (`pip-audit`). Frontend: 0 High/Critical/Moderate (`npm audit` exit 0). GDPR lifecycle + N8N HMAC-SHA256 complete.
- **Test Coverage**: Backend 461 passing, Frontend 0 TS errors.
- **GDPR Status**: 3-phase lifecycle deployed ✅. Cloud Scheduler active. Firestore indexes READY.
- **Architecture**: 1 stanza = 1 progetto → N progetti → 1 batch (canonical, no legacy multi-room per project).
- **Admin Console**: https://syd-admin-972229558318.europe-west1.run.app (Cloud Run, europe-west1, ADC auth)
- **Next High Priority**: 1) Run live evals (5 cases, 3 agents) | 2) Cookie Consent Banner (EU GDPR) | 3) Knowledge Item Distillation


