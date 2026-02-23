- **Last Updated**: 2026-02-23
- **Current Version**: `v3.5.10` (Mobile UX & Backend Warmup)
- **Last Major Sync**: 2026-02-23
- **Status**: `Active Development - Mobile Experience`
- **Next High Priority**: 1) Vertex AI Agent Playbooks | 2) Domain Migration

- **Video Strategy & Roadmap (v3.5.10)**:
    - **Research**: Completed technical audit of video compression patterns. Recommended **Google Cloud Transcoder API** for cost-effective (pay-as-you-go) backend optimization.
    - **Documentation**: Consolidated `docs/FUTURE_IDEAS.md` as the source of truth for long-term technical evolution, purging redundant/implemented tasks.
    - **Sync**: Verified baseline implementation of Backend Warmup and AI SEO strategies.
- **Mobile UX & Backend Warmup (v3.5.10)**:
    - **Camera Capture**: Separated photo/video/gallery into 3 distinct dialog options with dedicated file inputs. Fixed `accept` attributes for iOS/Android reliability.
    - **Security**: Restricted video formats to backend-validated set (mp4, quicktime, x-msvideo), added max 3 file selection limit, fixed event closure in handleFocus.
    - **Backend Warmup**: Implemented invisible `BackendWarmup.tsx` component that pings `/health` once per session (sessionStorage flag) with 5s AbortController timeout.
    - **Testing**: All 15 tests passing (11 ChatInput + 4 BackendWarmup), 0 type-check errors.
    - **Commit**: `6db95c8` — feat(mobile-ux): camera capture & backend warmup improvements

- **Infra Optimization & Vertex AI Design (v3.5.09)**:
    - **Artifact Registry**: Implemented automated cleanup policies (14-day retention/10 versions) and optimized Dockerfile caching to mitigate rising storage costs.
    - **Quote System**: Designed **Vertex-Native Strategy D**, shifting from self-hosted PostgreSQL/LangGraph to managed Vertex AI Agent Builder. Reduced estimated infra costs by ~$45/mo.
    - **Chat Resilience**: Added `SendMessage` facade in `ChatProvider.tsx` with robust guest-to-anonymous conversion and empty-message guarding.
- **M3 Expressive Chat Refactoring (v3.5.08)**:
    - **Chat UI**: Complete redesign of message bubbles using **M3 Expressive** shapes (asymmetric, organic radii).
    - **Motion**: Implemented "Elastic Physics" (spring: stiffness 120, damping 12) for message entry.
    - **Feedback**: Replaced static "Thinking..." with **M3LoaderShape** (morphing fluid geometry) and **Ironic Messages** (e.g., "Consultando l'architetto interiore...") cycled via `useTypingIndicator.ts`.
    - **Cleanup**: Refactored `ThinkingIndicator.tsx` to be a pure presentational component.

- **FAQ & SEO/GEO Optimization (v3.5.07)**:
    - **New Skill**: `faq-management-system` implemented to standardize Q&A content.
    - **GEO Strategy**: "Answer First" pattern applied (40-80 word direct answer + structured lists) for AI citation (Gemini/ChatGPT).
    - **Architecture**:
        - **Data Layer**: `web_client/lib/faq-data.ts` as Single Source of Truth.
        - **UI Layer**: `web_client/app/faq/page.tsx` with Server-Side Rendering and M3 Expressive animations (`FAQItem.tsx`).
        - **Metadata**: Automated JSON-LD `FAQPage` schema injection for Google Rich Snippets.
    - **Integration**: Added deep links in `Navbar` and `Footer` pointing to `/faq`.
- **Gemini CLI Mastery & Session Finalization (v3.5.06)**:
    - **Integration**: Standardized on official `gemini-cli` patterns via the new `antigravity-gemini-mastery` skill. 
    - **Optimization**: Defined the "Startup Ritual" (`/ide enable`, `/memory refresh`) for high-performance terminal workflows.
    - **Consistency**: Verified `GEMINI.md` as the primary source of truth for terminal agents, ensuring they follow the 3-Tier Law and Golden Sync.
- **Official Gemini-Antigravity Integration (v3.5.05)**:
    - **Standards First**: Removed custom `syd-cli` wrapper in favor of the official `npx @google/gemini-cli` pattern.
    - **Gemini CLI Mastery**: Workflow ottimizzato con `/ide enable` e automazione checkpointing.
    - **Gemini 2.5 Standard**: Migrazione completa a Gemini 2.5 (minimo) per tutto il backend e gli orchestratori.
    - **Cleanup**: Purged custom script and internal agent instruction files.
- **Blog UX & Stability Fix (v3.5.03)**:
    - **Critical Fix**: Resolved widespread `ReferenceError: Navbar is not defined` crash in Blog subpages. Re-injected missing imports (`Navbar`, `Footer`, `lucide-react`) that were stripped during the `BlogBackButton` rollout.
    - **UI Enhancement**: Implemented `BlogBackButton` with M3 Expressive design (Glassmorphism Pill + Framer Motion) for consistent navigation.
    - **Validation**: Verified page rendering and navigation via Browser Subagent.
- **Professional Release Restoration (v3.5.01)**:
    - **Phase 37 (Gemini 2.5 & Deployment Stabilization)**: Consolidation of memory files, **Total Upgrade to Gemini 2.5** standard, and resolution of Cloud Run startup crashes via resilient environment mapping.
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

---

## 📜 Repository History
Per la cronologia dettagliata delle fasi precedenti (Phase 1 - Phase 36), consulta il documento:
[HISTORICAL_MILESTONES.md](file:///c:/Users/User01/.gemini/antigravity/scratch/renovation-next/directives/HISTORICAL_MILESTONES.md)

---
---

## 🎯 Phase 35 Summary (2026-02-23)

**Mobile Experience + Performance Optimization**

### Camera/Gallery Capture Redesign
- **Problem**: Single file input with `capture="environment"` + combined `accept` didn't reliably trigger camera vs. gallery on iOS/Android
- **Solution**: 3 dedicated inputs with clear user intent
  - "Scatta Foto" → `accept="image/*"` + `capture="environment"`
  - "Registra Video" → `accept="video/mp4,video/quicktime,video/x-msvideo"` + `capture="environment"`
  - "Galleria o Documento" → full accept, no capture
- **Security**: Video format restriction prevents unsupported codec uploads; 3-file limit prevents DoS

### Backend Instance Pre-warming
- **Goal**: Reduce Cold Start latency for first chat interaction
- **Pattern**: Invisible component fires single `GET /health` on page load
- **Guards**: sessionStorage flag (1 ping/tab), AbortController 5s timeout, fire-and-forget error handling
- **Why Not fetchWithAuth**: `/health` is public (no auth overhead needed)

### Verification
✅ Type-check: 0 errors
✅ Tests: 15/15 passing
✅ Commit: 6db95c8 (single atomic change)

_Documento aggiornato: Febbraio 23, 2026_
