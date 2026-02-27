- **Last Updated**: 2026-02-27
- **Current Version**: `v3.6.04` (Enterprise UX Polish & Backend DB Fix)
- **Last Major Sync**: 2026-02-27
- **Status**: `Production-Ready - UX Refinement`
- **Next High Priority**: 1) Dynamic Robot Mascot | 2) Vertex AI Agent Playbooks | 3) Domain Migration

- **Enterprise UX Polish & Backend DB Fix (v3.6.04)**:
    - **Mobile Navigation (`Navbar.tsx`)**: Refactored the mobile drawer menu to align with `enterprise-user-dashboard-ux` standards. Replaced the generic dashboard icon with "AREA PERSONALE" and unified all navigation links into identical premium glass containers (`bg-white/5`, `border-white/10`) featuring haptic feedback (`navigator.vibrate`) and M3 Expressive scaling on press. Updated the header to use "MENU" with editorial tracking (`tracking-[0.3em]`).
    - **Profile Hub (`SignInButton.tsx`)**: Upgraded the user profile trigger to a dual-label design ("Profilo" / "Account") to provide clear context on all screen sizes. Applied luxury-gold borders and a subtle glass effect, linking directly to `/dashboard/profile`.
    - **Backend Database Fix**: Resolved an `AttributeError` in `backend_python/src/db/projects.py` that caused `test_construction_details.py` to fail. Removed the `.value` accessor from `details.property_type` since the `ProjectDetails` Pydantic model is already configured with `use_enum_values=True`. All 172 backend tests now pass.

- **Frontend Dead Code Elimination (v3.6.03)**:
    - **Asset Pruning**: Removed 26+ isolated and unused files across `components`, `hooks`, `stores`, and `types` (e.g., `StatCard`, `ThinkingSurface`, `useDocumentUpload`, `zustand` store since TanStack Query took over).
    - **Dependency Cleanup**: Uninstalled 9 unused dependencies from `web_client/package.json` (including `zustand`, `date-fns`, `jsonwebtoken`, `@radix-ui/react-tabs`).
    - **Code Refactoring**: Removed dead exports from `api-client.ts`, simplified motion variants in `m3-motion.ts`, and cleaned up validation schemas.
    - **Linting & Performance**: Resolved over 100 ESLint warnings, primarily focusing on unused imports and critically fixing `set-state-in-effect` cascading renders in `ChatProvider.tsx` and `ChatWidget.tsx` using `setTimeout` wrappers.
    - **Verification**: Maintained strict "Zero-Refactor" policy by guaranteeing 0 errors on `npm run type-check` and `npm run build` post-cleanup.

- **Mobile Navigation & Dashboard Freeze Fix (v3.6.02)**:
    - **Dashboard Freeze**: Fixed an issue where opening a project on mobile would freeze the entire application. The root cause was `useMobileViewport` forcefully setting `pointer-events: none` and `position: fixed` on the body for inline chats.
    - **Resolution**: Added `isInline` flag to bypass body locks for non-overlay instances.
    - **Layout Collapse**: Fixed a notorious Safari/Chrome mobile bug where flexbox containers collapse to `0px` inside nested scroll areas by restoring explicit `100dvh` boundaries in `MobileSwipeLayout.tsx` and `app/dashboard/[id]/page.tsx`.
    - **Performance**: Changed inactive tabs in `ProjectMobileTabs.tsx` from `opacity-0` to `hidden` (`display: none`) to prevent DOM ghosting and interaction traps.
    - **Swipe Navigation**: Removed `data-no-swipe` from `ProjectFilesView` and `ProjectSettingsView` to re-enable global fluid horizontal swipe gestures across all project tabs.

- **Frontend Architecture Hardening (v3.6.01)**:
    - **Golden Sync**: Validated and aligned 1:1 parity between frontend (`types/`) and backend (`models/`, `schemas/`).
    - **Real-time Engine**: Conducted an architectural review of real-time listeners.
    - **ADR-001**: Created `ADR-001` documenting the decision to maintain `onSnapshot` as a documented exception for user-owned data.
    - **Hardening**: Implemented error handlers and guardrails for all 3 `onSnapshot` usage points.
    - **Performance**: Verified 0 type-check errors across the ecosystem.

- **Modern State Management & Mobile Native UI (v3.6.00)**:
    - **State Architecture**: Migrated from SWR/Legacy to **TanStack Query v5** (Server State) + **Zustand** (Client State).
    - **Mobile UX**: Implemented **Vaul** (Drawer) for "True Native" mobile experience in Create/Rename workflows.
    - **Components**:
        - `QueryProvider.tsx`: Centralized query client with DevTools.
        - `useUIStore.ts`: Global UI state management.
        - `ResponsiveDrawer.tsx`: Adaptive component (Dialog on Desktop, Drawer on Mobile).
    - **Hardening**: Enforced `overscroll-behavior-y: none` and removed tap highlights for app-like feel.
    - **Testing**: Updated `useTypingIndicator` to be deterministic and fixed `ChatInput` tests.
    - **Clean-up**: Removed `swr` and legacy `window.dispatchEvent` patterns.

- **Attachment Menu Refactor (v3.5.15)**:
    - **Refactoring**: Transformed the full-screen attachment `Dialog` into a sleek, context-aware `AttachmentMenu` (Dropdown).
    - **UI/UX**: Implemented **M3 Expressive** design with Glassmorphism (`backdrop-blur-xl`), custom Spring animations (`framer-motion`), and rounded organic shapes (`rounded-2xl`).
    - **Components**: Created `AttachmentMenu.tsx` to encapsulate logic and clean up `ChatInput.tsx`.
    - **Risks Mitigated**: Added ESC key support for accessibility and verified stacking context to prevent clipping.

- **Architecture & Documentation Solidification (v3.5.14)**:
    - **Full Audit**: Comprehensive update of all system documentation to reflect the "Luxury Tech" and "Reasoning Engine" reality.
    - **Artifacts Updated**:
        - `backend_architecture_report.md`: Detailed the 3-Tier Execution and Zero-Trust Security.
        - `CHATBOT_ARCHITECTURE.md`: Documented the Vercel AI SDK -> LangGraph streaming pipeline.
        - `ADMIN_CONSOLE_PRICING_ENGINE.md`: Clarified the "Golden Sync" between Price Book JSON and AI Reasoning.
        - `web_client/README.md`: Updated stack versions (Tailwind 4, Framer Motion 12) and "Luxury Tech" vision.
    - **Clean-up**: Removed dead Magic Link analytics code and verified frontend type safety.
    - **Mascot Plan**: Created `docs/PLANS/dynamic_mascot_implementation.md` outlining the "Layered Puppet" strategy for the upcoming interactive robot.

- **ChatToggleButton Blur Fix (v3.5.13)**:
    - **Bug**: Image appeared blurry due to GPU compositing layer conflicts.
    - **Root Cause**: `drop-shadow-xl` + `transform transition-transform` combined with Framer Motion `scale` transforms forced separate GPU layers with aggressive antialiasing.
    - **Fix**: Removed shadow/transform classes from `Image`, added `backfaceVisibility: 'hidden'` + `transform: translateZ(0)` to motion container for unified stacking context.
    - **Result**: Sharp, crisp rendering across all viewports and screen sizes.

- **Login Modal Redesign (v3.5.13)**:
    - **Visual Overhaul**: Transformed `AuthDialog` into a "Luxury Tech" interface using M3 Expressive principles.
    - **Key Features**: Glassmorphism container, Organic shapes (asymmetric radii), Elastic motion (spring physics), and Draggable Notch visual.
    - **Typography**: Integrated `Cinzel` (via `font-trajan`) for headlines to align with brand luxury identity.
    - **Components**: Updated `PasskeyButton` to support custom styling and `h-14` (56px) height for touch targets.

- **Cost Optimization (v3.5.13)**:
    - **CI/CD**: Disabled live API tests in CI by renaming `test_imagen_isolation.py` → `verify_imagen_isolation.py` and adding `-m "not integration"` to pytest.
        - **Result**: ~90% reduction in Gemini Vision API spend during CI/CD pipeline.
    - **Artifact Registry**: Activated automated cleanup policies (14-day retention & 10-version limit) for `cloud-run-source-deploy` and `mcp-cloud-run-deployments`.
    - **Result**: Automated storage cost control (Standardizing on `policy.json`).

- **Biometric Auth Integration (v3.5.12)**:
    - **Feature**: Enabled Biometric Login (Passkeys/WebAuthn) directly from User Profile.
    - **UX**: Refactored `PasskeyButton.tsx` to match Luxury Gold design system.
    - **Guidance**: Implemented smart "User Not Found" dialog handling for login attempts without prior registration, guiding users to first-time setup.
    - **Profile**: Integrated registration flow into `app/dashboard/profile/page.tsx` with success feedback.

- **Mobile UX Polish (v3.5.11)**:
    - **Chat Toggle**: Increased mobile touch target to 158px (+10%) and verified right-alignment for better ergonomics.
    - **Code**: Updated `ChatToggleButton.tsx` and aligned test comments.
    - **Verification**: Tests passed.

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

- **Governance**: Standardized on official `gemini-cli` patterns and implemented the **Multi-Agent Collaboration Protocol (v1.0)** in `directives/MULTI_AGENT_PROTOCOL.md` for parallel Antigravity, Gemini-CLI, and Claude Code orchestration.

---

## 🎯 Phase 39 Summary (2026-02-24)

**Attachment Menu Refactor**

### UI/UX Modernization
- **Problem**: The attachment selection was a full-screen modal, interrupting the chat flow.
- **Solution**: Implemented a **M3 Expressive Dropdown Menu** (`AttachmentMenu.tsx`) anchored to the input bar.
- **Design**: Leveraged Glassmorphism and Spring animations for a premium, non-intrusive feel.

_Documento aggiornato: Febbraio 24, 2026_
