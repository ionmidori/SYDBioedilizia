# Project Context Summary - Renovation-Next

- **Last Updated**: 2026-02-22
- **Current Version**: `v3.5.01`
- **Status**: `STABLE` — Professional Release Restored ✅ | Security Hardened ✅ | 173 Tests ✅
- **Next High Priority**: 1) Domain Migration | 2) Monitoring Production Build

- **Professional Release Restoration (v3.5.01)**:
    - **Dashboard Actions**: Restored "Crea Preventivo" and "Crea Rendering" quick actions with horizontal snap-scrolling.
    - **Swipe Indicators**: Restored M3 gold chevrons (SwipeHints) for visual navigation feedback.
    - **UI Cleanup**: Removed redundant project footer to optimize vertical workspace.
    - **Security Hardening**: Remediated High-Severity ReDoS in `minimatch` (CVE-2024-XXXX) by forcing versions `3.1.3` and `9.0.6` via root overrides.
- **Status**: v3.5.01 (Production Sync + Secured)
- **Professional Release Synchronization (v3.5.00)**: 
    - Merged `feat/technical-stabilization-v3.5.0` into `main`.
    - Pushed synchronized states to `origin/main` using secure PAT authentication.
    - Consolidated 10+ atomic commits into the production baseline.
- **Technical Stabilization**:
    - **CI/CD Fix**: Resolved Cloud Run deployment failure by removing `pyproject.toml` and `uv.lock` from `.dockerignore`, ensuring `uv sync` succeeds in the build context.
    - **Git Clean-up**: Purged all stale and merged remote branches on GitHub, maintaining only `main` for a pristine source of truth.
    - **Backend (Pytest)**: Achieved **100% pass rate** (173/173 tests).
    - **n8n Mocks**: Fixed `httpx` async/sync mocking mismatches in `conftest.py`.
    - **Schema Sync**: Updated `QuoteItem` schema to allow zero-quantity items (`ge=0`).
- **Web Modernization & SEO/GEO**:
    - **Blog Overhaul**: Implemented "Image-First" interactive blog with photorealistic renovation content.
    - **AI Visibility**: Completed standard `llms.txt`, `robots.ts`, and `sitemap.ts` implementation.
    - **M3 UI Polish**: Finalized M3 Edge Swipe indicators and hardened Firebase Auth resilience against COOP/COEP blockers.
- **Infrastructure**:
    - **Test Automation**: Integrated `test_router.py` into production main and updated `insight_engine` telemetry.
- **Artifacts**: [walkthrough.md](file:///C:/Users/User01/.gemini/antigravity/brain/3914d1d0-a713-4c6a-9663-4e6b33eac828/walkthrough.md) | [task.md](file:///C:/Users/User01/.gemini/antigravity/brain/3914d1d0-a713-4c6a-9663-4e6b33eac828/task.md)

## 📱 Phase 34 — QA Verification & Infrastructure Polish (COMPLETE ✅)
- **Status**: v3.3.0-alpha (QA Verified)
- **Infrastructure**:
    - **TestSprite API Fix**: Updated `mcp_config.json` and global TestSprite AppData `config.json` with active API key. 
- **QA & Testing**:
    - **Backend (Scripts)**: Verified `TC001`, `TC003`, `TC004`, and `TC005` using manual Python orchestrator scripts. Verified chat history context injection into LangGraph quote flow.
    - **Frontend (Manual)**: Utilized AI Browser Subagent for E2E verification of homepage, chat-backend sync, and dashboard routing.
- **Polish**: Resolved and verified fixes for hero video loading, COOP/COEP headers, and Firebase logout race conditions.
- **Artifacts**: [walkthrough.md](file:///C:/Users/User01/.gemini/antigravity/brain/6498c988-4b83-4e6c-a3fa-a9da0515d3e3/walkthrough.md) | [task.md](file:///C:/Users/User01/.gemini/antigravity/brain/6498c988-4b83-4e6c-a3fa-a9da0515d3e3/task.md)

## 📱 Phase 33 — Auth Resilience & Swipe UI Polish (COMPLETE ✅)
- **Status**: v3.2.0-alpha (Production Polish)
- **Security & Auth**:
    - **COOP/COEP Fix**: Updated `next.config.ts` to set `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` to `unsafe-none`. This resolves the "window.closed" blocking errors in Chrome for Firebase OAuth popups.
- **UI & UX Polish**:
    - **Swipe Stabilization**: Modified `ProjectMobileTabs.tsx` to remove physical content translation during swipe, ensuring the layout remains stationary while the **M3 Edge Swipe Indicators** provide aesthetic feedback. 
    - **Native Gesture Override**: Globally disabled `overscroll-behavior-x` in `globals.css` to prevent the browser's native blue navigation arrows from clashing with the M3 design.
    - **Consistent Aesthetics**: Shared the `SwipeHints` (gold M3 chevrons) component between the main dashboard and specific project subpages.
- **Documentation**: Located the legacy **Backend Strategy (Plan A, B, C)** document in `docs/archive/QUOTE_SYSTEM_STRATEGIES.md`.

## 📱 Phase 32 — SEO & GEO Optimization (COMPLETE ✅)
- **Status**: v3.1.0-alpha (GEO & AI Visibility)
- **New Skill**: `nextjs-seo-geo` applied to standardize Metadata, Sitemap, and AI optimization.
- **Implementation**:
    - **Robots & Sitemap**: Implemented `app/robots.ts` and dynamic `app/sitemap.ts` covering static pages and blog posts.
    - **AI Visibility**: Created `public/llms.txt` for AI Answer Engines (Perplexity, Gemini) with structured Mission, Entities, and FAQ.
    - **Metadata Upgrade**: Updated `app/layout.tsx` with comprehensive OpenGraph, Twitter, and Canonical metadata.
    - **Temporary Domain**: Configured all SEO/GEO files to use `https://sybioedilizia.vercel.app` as the base URL pending final domain migration.
- **Validation**: Confirmed correct structure for `llms.txt` and valid JSON-LD schemas.

## 📱 Phase 31 — M3 Expressive Dashboard Refinement & Swipe Stabilization (COMPLETE ✅)
- **Status**: v3.0.0 (Luxury & Stability Refined)
- **Swipe Stabilization**: Resolved layout deformations by refactoring `MobileSwipeLayout.tsx`. Removed physical translation that broke fixed layouts (sidebar/header). Implemented **M3 Edge Swipe Indicators** using dynamic chevrons and `useTransform` for non-destructive visual feedback during gestures.
- **M3 UI Redesign**:
    - **Capture Dialog**: Redesigned attachment dialog with advanced glassmorphism (`backdrop-blur-[48px]`), deep shadows, and bento-style rounded corners (`rounded-[2.5rem]`).
    - **Project Selector**: Redesigned dropdown with interactive hover glows (`luxury-gold`) and fixed viewport overflow alignment (`right-0`).
- **Optimization**: Removed redundant mobile footer navigation tabs in `ProjectMobileTabs.tsx` to maximize vertical space while preserving horizontal swipe logic.  
- **Technical Fix**: Resolved hydration error in `ChatInput.tsx` (nested buttons) using `asChild` pattern.
- **Artifacts**: [walkthrough.md](file:///C:/Users/User01/.gemini/antigravity/brain/6498c988-4b83-4e6c-a3fa-a9da0515d3e3/walkthrough.md)

## 📱 Phase 29 — Mobile Capture & Security Audit (COMPLETE ✅)
- **Status**: v2.9.40 (Security & UX Enhanced)
- **Mobile Capture**: Implemented `mobile-camera-capture` skill. Added native Camera support in Chat and Dashboard via Dialog-choice menu. Refactored `ChatInput.tsx` and `FileUploader.tsx`.
- **Security Audit**: Hardened n8n `workflow_deliver_quote.json` (fixed HMAC fail-open). Analyzed mobile capture for privacy compliance.
- **Enterprise UX**: Created `enterprise-user-dashboard-ux` skill (Bento/Glassmorphism 2026). Updated `animating-ui-interactions` for swipe transitions.
- **Dashboard Stability**: Fixed Mobile double scrollbars & optimized Quick Actions for touch swipe. Resolved critical Firebase `onSnapshot` permission error in `useChatHistory` for guest/global sessions. 
- **Artifacts**: [implementation_plan.md](file:///C:/Users/User01/.gemini/antigravity/brain/6ddce9e8-1019-4150-9e06-13f17a686190/implementation_plan.md) | [task.md](file:///C:/Users/User01/.gemini/antigravity/brain/6ddce9e8-1019-4150-9e06-13f17a686190/task.md) | [walkthrough.md](file:///C:/Users/User01/.gemini/antigravity/brain/6ddce9e8-1019-4150-9e06-13f17a686190/walkthrough.md) | [mobile_ux_audit.md](file:///C:/Users/User01/.gemini/antigravity/brain/ad0bc1c1-e70c-4018-be28-6cb823148c46/mobile_ux_audit.md)

## 🤖 Phase 28 — TestSprite & n8n MCP Integration (COMPLETE ✅)
- **Status**: v2.9.30 (Production-Ready QA)
- **QA & Testing**: Established `testsprite-automated-qa` skill. Aligned TC001-TC010 with `/api/` and implemented `test_router.py` REST gateway.
- **Workflow**: Configured n8n MCP server (apaxhud.app.n8n.cloud) for admin notifications and quote delivery.
- **Artifacts**: [walkthrough.md](file:///C:/Users/User01/.gemini/antigravity/brain/095ffb4e-ed08-4904-8731-8184a357aed2/walkthrough.md) | [n8n_mcp_setup.md](file:///C:/Users/User01/.gemini/antigravity/brain/095ffb4e-ed08-4904-8731-8184a357aed2/n8n_mcp_setup.md)

## 🗄️ Phase 27 — Modernization & UAT Readiness (COMPLETE ✅)
- **Status**: Verified Operative (v2.9.21)
- **Key Fixes**: `FirestoreSaver` instantiation, `GOOGLE_CLOUD_PROJECT` alias, missing dependencies, and `main.py` modernization.
- **Artifacts**: [n8n_setup_guide.md](file:///C:/Users/User01/.gemini/antigravity/brain/11e8a72a-72db-4adf-99e8-bfdf5394c88c/n8n_setup_guide.md) | [n8n_mcp_setup.md](file:///C:/Users/User01/.gemini/antigravity/brain/095ffb4e-ed08-4904-8731-8184a357aed2/n8n_mcp_setup.md) | [testsprite_implementation_plan.md](file:///C:/Users/User01/.gemini/antigravity/brain/095ffb4e-ed08-4904-8731-8184a357aed2/testsprite_implementation_plan.md)
- **QA & Testing**: Established `testsprite-automated-qa` skill. Fixed TestSprite TCs (1-10) by aligning with `/api/` paths and implementing `test_router.py` as a REST gateway for orchestrator tools.      

### 🔐 Dependency Audit (2026-02-20) — COMPLETE ✅
**Python Backend:**
- ✅ CVE Vulnerabilities: **0** (pip-audit clean)
- Python 3.12.12 LTS active
- Upgraded: 6 safe packages (`langgraph@1.0.9`, `langchain-*`, `pydantic-settings@2.13.1`, `uvicorn@0.41.0`)
- Deferred: `pytest@9`, `pandas@3`, `protobuf@6` (major upgrades → Phase 28)    

**npm Frontend:**
- ⚠️ 35 vulnerabilities reported (1 moderate, 34 high)
- **CONTEXT**: All 35 are dev/build toolchain only (`eslint@9`, `jest@29`, ReDoS in `minimatch`/`ajv`)
- **PRODUCTION BUNDLE**: No CVE vulnerabilities ✅ (not shipped to users)        
- Applied: 2 safe minor patches via `npm audit fix`
- **Action**: `eslint@10` + `jest@30` migration deferred to Phase 28 (breaking changes require config refactoring)

### 🗄️ Build Verification (2026-02-20) — COMPLETE ✅
**Security Audit:**
- ✅ **Test Files**: No hardcoded real API keys (all mock: `test-*` prefix)      
- ✅ **admin_tool/test_*.py**: Mock credentials only
- ✅ **backend_python/tests/**: Mocked environment variables

**Frontend Build (Next.js 16.1.6):**     
- ✅ Compilation: 39.9s (Turbopack)     
- ✅ TypeScript: Clean type-check       
- ✅ Static Pages: 18/18 pre-rendered (dashboard, projects, settings, gallery, auth flows)
- ✅ Bundle Size: 3.1MB (production-ready)

**Backend Build (Python 3.12.12 + FastAPI):**
- ✅ Dependencies: 151 packages resolved, 0 CVEs
- ✅ Startup: Lifespan context manager active
- ✅ /health Endpoint: 200 OK (`{"status":"ok","service":"syd-brain"}`)
- ✅ Middleware Stack: Request ID, metrics, App Check, security headers
- ✅ **CRITICAL FIX**: `langgraph-checkpoint-firestore@0.1.7` installed (was missing in .venv)
- ✅ QuoteGraphFactory: Initializes cleanly, FirestoreSaver ready for HITL       

**Commit Chain:**
1. `49c07ef` — Phase 27 modernization fixes
2. `44a25c1` — Dependency audit results
3. `6c2529a` — Fix: langgraph-checkpoint-firestore in uv.lock
4. `d0a78c6` — feat(auth): implement dashboard guard and maintenance mode in middleware
5. `ff8787c` — docs: add gemini cli research help text
6. `f7e1b2a` — feat(ui): update footer branding to SYD BIOEDILIZIA
7. `...` — feat(admin): add auth configuration and test utilities
8. `...` — feat(qa): implement test router and align TestSprite TCs

**Overall Status: ALL SYSTEMS GO ✅** — No blockers, production-ready for UAT. 

Quest file serve come memoria storica per l'IA per evitare regressioni su bug critici risolti e mantenere la continuità architetturale.

## 📋 Strategic Directives
- **Skills Registry**: [SKILLS_REGISTRY.md](file:///c:/Users/User01/.gemini/antigravity/scratch/renovation-next/directives/SKILLS_REGISTRY.md) - Mandatory consultancy for all technical tasks.

## 🚀 Phase 26 — Cloud Schema Enrichment & UAT Prep (2026-02-20) ✅

### 🗄️ Firestore Schema & Repository (COMPLETED)
- **`quote_repo.py`** [MODIFIED]: Added `update_project()` method. `get_client_info()` and `get_project_details()` now support `address`, `client_email`, and `client_name`.
- **`delivery_service.py`** [MODIFIED]: Enriched n8n webhook payload with `client_address` for job-site targeting in email templates.
- **`scripts/enrich_projects.py`** [NEW]: Utility to patch existing Firestore documents with sample data (`client_email`, `name`, `address`) for UAT stability.     

### ⚡ Infrastructure Recovery (COMPLETED)
- **`uv sync`**: Resolved all backend dependencies including `langgraph-checkpoint-firestore`.
- **Admin Tool**: Multi-page console successfully launched via `python -m streamlit`.
- **HITL Check**: Verified `quote_graph.py` and `quote_routes.py` strictly follow the `langgraph-hitl-patterns` skill (FirestoreSaver, Soft Interrupt, ainvoke(None)).

## 🚀 Phase 25 — HITL Graph + Error Handling (2026-02-20) ✅

### 🗄️ Admin Console Multipage Architecture (COMPLETED)
- **`app.py`**: Pure auth shell — routing delegato a Streamlit native multipage.
- **`pages/1_📋_Quotes.py`**: Lista preventivi + review + approve/reject con auth guard e `@st.cache_resource`.
- **`pages/2_💰_Price_Book.py`**: Editor interattivo SKU (`st.data_editor`), 3 KPI, salvataggio JSON, export CSV. Auth guard aggiunto.

### ⚡ HITL LangGraph Quote Flow (COMPLETED)
- **`src/graph/quote_state.py`** [NEW]: `QuoteState(TypedDict)` separato da `AgentState` per il flusso HITL. Campi: `project_id`, `ai_draft`, `admin_decision: Literal`, `admin_notes`, `pdf_url`.
- **`src/graph/quote_graph.py`** [NEW]: Grafo HITL con `FirestoreSaver` checkpointer, `interrupt_before=["admin_review"]`. `QuoteGraphFactory` per DI. Nodi: `quantity_surveyor`, `admin_review` (stub), `finalize`.
- **`src/api/routes/quote_routes.py`** [NEW]: FastAPI endpoints HITL:
  - `POST /quote/{project_id}/start` → Fase 1 (202 Accepted, suspenso su Firestore)
  - `POST /quote/{project_id}/approve` → Fase 2 (`aupdate_state` + `ainvoke(None, config)` per resume)
- ⚠️ `quote_routes.py` NON ancora registrato in `main.py` — **pending task**.

### 🛡️ Error Handling Patterns (COMPLETED)
- **`backend_python/src/core/exceptions.py`** [EXTENDED]: Aggiunte `QuoteNotFoundError`, `QuoteAlreadyApprovedError`, `CheckpointError`, `PDFGenerationError`, `PDFUploadError`, `DeliveryError` — retrocompatibili con `AppException`.
- **`admin_tool/src/core/exceptions.py`** [NEW]: Gerarchia leggera per admin_tool: `AdminError` base + `QuoteNotFoundError`, `QuoteAlreadyApprovedError`, `PDFGenerationError`, `DeliveryError`.
- **`admin_tool/src/db/quote_repo.py`** [MODIFIED]: `get_quote()` ora solleva `QuoteNotFoundError` invece di restituire `{}` silenziosamente.

### 🚧 Decisione Strategica: Piano C Backend (DEFERRED)
- **Non applicare ora**: `AgentOrchestrator` è stabile in produzione. Refactoring strutturale → rischio regressione su `/chat/stream`.
- **Applicare in v3.0.0**: Dopo UAT + n8n config. `AgentController` + `FirestoreSaver` per `AgentState` principale + subgraph (`QuoteSubgraph`, `DesignSubgraph`).  
- **Compromesso attuale**: `FirestoreSaver` applicato SOLO al `QuoteGraph` (nuovo), non all'orchestratore esistente.       

- **Pattern**: Applied `building-admin-dashboards`, `generating-pdf-documents`, `n8n-mcp-integration` skills.
- **delivery_service.py**: `requests` → `httpx.AsyncClient` + `tenacity` retry (3x exponential backoff).
- **pdf_service.py**: UTC-aware datetimes, explicit CPU-bound documentation for `run_in_threadpool`.
- **quote_repo.py**: New `get_client_info()` reads real `client_email`/`client_name` from Firestore `projects/{id}`.       
- **admin_service.py**: Real client data in approval pipeline; `ThreadPoolExecutor` for PDF (CPU-bound).
- **dashboard.py**: 3 aggregate KPIs, € encoding fixed, client name + status badge per row.
- **review.py**: Project info expander (name/email/address), `admin_notes` pre-populated, Reject button.
- **app.py**: `Path(__file__).parent` for config.yaml (CWD-independent).
- **firebase_init.py**: `print()` → `logger`, idempotent guard, ADC fallback documented.
- **quote_template.html**: `client_name` shown conditionally in PDF.
- **NEW `pages/2_💰_Price_Book.py`**: Interactive Price Book editor with category filter, KPIs, save → JSON, CSV export.

## 🚀 Novità Precedente (Phase 23 - Delivery Integration)

### 📤 Delivery Workflow (COMPLETED ✅)
- **PDF Generation**: `PdfService` con WeasyPrint + Jinja2 — genera PDF professionali.
- **Firebase Storage**: Upload automatico PDF con signed URL (7 giorni).
- **n8n/MCP Webhook**: `DeliveryService` → webhook n8n (`N8N_WEBHOOK_DELIVER_QUOTE`).
- **Orchestration**: `AdminService.approve_quote` pipeline: `Data → PDF → Upload → Webhook → DB Update`.

## 🚀 Novità Precedente (Phase 22 - Refactoring & Security)

### 🔐 Pattern Alignment & Security (COMPLETED ✅)
- **Quantity Surveyor Pattern**: Refactored `backend_python/src/tools/quote_tools.py` to implement "Chat Summary" and "SKU Validation".
- **Admin Security**: Implemented `streamlit-authenticator` in `admin_tool/app.py`.
- **Architecture**: Admin Dashboard strictly follows `building-admin-dashboards` skill structure.

## 🚀 Novità Precedente (Phase 21 - Quote AI Engine)

### 🤖 AI Insight Engine (COMPLETED ✅)
- **Insight Engine**: Analisi chat/foto con Gemini 1.5 Flash.
- **Master Price Book**: Listino prezzi in JSON.
- **Quote Tool**: Tool per l'agente per generare bozze.
