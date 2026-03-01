- **Last Updated**: 2026-03-01
- **Current Version**: `v3.6.11` (Quote System Security Hardening)
- **Last Major Sync**: 2026-03-01
- **Status**: `Production-Ready - Enterprise Security Complete`
- **Next High Priority**: 1) Biometric Auth Expansion | 2) Dynamic Robot Mascot | 3) Vertex AI Agent Playbooks

- **Accessibility & Navigation Standardization (v3.6.07)**:
    - **A11y Debt Resolution**: Refactored the mobile navigation drawer in `Navbar.tsx`, replacing the custom `framer-motion` overlay with a Radix UI-based `Sheet` component. This fixed critical accessibility issues including **Focus Trap** violations and `aria-hidden` attribute warnings.
    - **New UI Component**: Implemented `web_client/components/ui/sheet.tsx` following Shadcn/UI standards, providing a reusable, accessible primitive for side-drawers.
    - **M3 Expressive Integration**: Successfully ported the **Glassmorphism** aesthetic and premium spring animations into the Radix primitive, maintaining the "Luxury Tech" design while gaining native keyboard support (ESC key) and backdrop management.
    - **Verification**: Verified 0 TypeScript errors after the refactor and confirmed correct behavioral interaction on mobile viewports.

- **Form Compliance & Security Hardening (v3.6.06)**:
    - **Pattern Standardization**: Successfully migrated all high-risk forms to **React Hook Form (RHF) + Zod** validation, achieving 100% compliance with `advanced-form-patterns`.
    - **Authentication Refactor**: Migrated `EmailAuthForm.tsx`, `MagicLinkForm.tsx`, and `VerifyPage.tsx` to the new `authSchema`, eliminating insecure manual `useState` validation.
    - **Visual Rate Limiting**: Implemented a visual lockout mechanism in the authentication form (30s cooldown after 3 failed attempts) to mitigate local brute-force attempts.
    - **XSS & Injection Defense**: 
        - Created `web_client/utils/security.ts` with `sanitizeMessage` utility to clean backend error messages before rendering.
        - Integrated XSS regex patterns into all Zod schemas to block HTML tags in user inputs.
        - Implemented a **Honeypot field** in `LeadCaptureForm.tsx` for transparent bot protection.
    - **Middleware Security**: Added essential security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection`, `Referrer-Policy`) to the global Next.js middleware.
    - **Type Safety**: Resolved all TypeScript errors related to dynamic schema switching in authentication modes.

- **Dashboard Stability & Data Fix (v3.6.05)**:
    - **Statistics API (`stats-api.ts`)**: Resolved a critical fetch error in `getStats` where the request to `${API_ROOT}/reports/dashboard` was failing with a generic error. Standardized the error handling to prevent dashboard-wide crashes.
    - **Dashboard UI Resilience**: Verified and hardened the dashboard against navigation freezes on mobile viewports.
    - **Accessibility Audit**: Completed a comprehensive accessibility audit of the mobile navigation and project dialogs. The proposed refactor (Sheet-based navigation and Zod/Form primitives) was analyzed but subsequently reverted for further design review.

- **Phase 41 (Feb 27, 2026):** **Stability, Accessibility & Form Standard.**
  - **Stability:** Fixed "Undefined" status and project stats synchronization on Dashboard.
  - **Accessibility:** Replaced custom mobile navigation in `Navbar.tsx` with Radix-based `Sheet` (Drawer).
  - **Standardization:** Created `form.tsx` primitives and refactored `CreateProjectDialog` and `RenameProjectDialog` to follow Enterprise Form standards.
  - **Verification:** Passed `npm run type-check` with Exit code: 0.

- **Enterprise UX Polish & Backend DB Fix (v3.6.04)**:
    - **Mobile Navigation (`Navbar.tsx`)**: Refactored the mobile drawer menu to align with `enterprise-user-dashboard-ux` standards. Replaced the generic dashboard icon with "AREA PERSONALE" and unified all navigation links into identical premium glass containers (`bg-white/5`, `border-white/10`) featuring haptic feedback (`navigator.vibrate`) and M3 Expressive scaling on press. Updated the header to use "MENU" with editorial tracking (`tracking-[0.3em]`).
    - **Profile Hub (`SignInButton.tsx`)**: Upgraded the user profile trigger to a dual-label design ("Profilo" / "Account") to provide clear context on all screen sizes. Applied luxury-gold borders and a subtle glass effect, linking directly to `/dashboard/profile`.
    - **Backend Database Fix**: Resolved an `AttributeError` in `backend_python/src/db/projects.py` that caused `test_construction_details.py` to fail. Removed the `.value` accessor from `details.property_type` since the `ProjectDetails` Pydantic model is already configured with `use_enum_values=True`. All 172 backend tests now pass.

- **Frontend Dead Code Elimination (v3.6.03)**:
    - **Asset Pruning**: Removed 26+ isolated and unused files across `components`, `hooks`, `stores`, and `types` (e.g., `StatCard`, `ThinkingSurface`, `useDocumentUpload`, `zustand` store since TanStack Query took over).
... [69.000 characters omitted] ...
- **Phase 42 (Feb 28, 2026):** **Frontend Polish & A11y Fix (v3.6.10)**:
  - **A11y Fix**: Implemented 300ms delay for Login Modal trigger in `Navbar.tsx` to prevent `aria-hidden` focus restoration conflict with mobile `Sheet`.
  - **Modernization**: Updated `firebase.ts` to use `initializeFirestore` + `persistentLocalCache`, clearing deprecation warnings.
  - **Security**: Hardened `next.config.ts` with COOP/COEP for Firebase Auth and enriched CSP for Vercel Analytics.
  - **SVG Fix**: Corrected malformed WhatsApp path in `Navbar.tsx`.
  - **Verification**: All backend/frontend checks passed.

- **Phase 43 (Mar 01, 2026):** **Quote System Security Hardening (v3.6.11)**:
  - **P0 Auth + RBAC**: All 6 quote endpoints secured via `Depends(verify_token)`. Added admin role checks (`_require_admin`) and project ownership validation (`_verify_project_ownership`). IDOR vulnerability on `/quote/user/{user_id}` patched.
  - **P0 Rate Limiting**: Dedicated limiter module created (`src/core/rate_limit.py`). Endpoint-specific limits: start 5/h, approve 10/h, list/get 60/min, update 20/min, delete 5/h, pdf 20/min.
  - **P1 n8n Webhook Hardening**: Implemented HMAC-SHA256 request signing with timestamp. Added SSRF prevention via `N8N_ALLOWED_WEBHOOK_HOSTS` allowlist. Idempotency keys added to payloads. Request body compact-serialized for exact signature matching.
  - **P1 Pricing Tool Bounds**: Added quantity validation (`_MIN_QTY=0.01`, `_MAX_QTY=10,000`) to prevent pricing injection. Grand total sanity check (<€100 for multi-item quotes) logs hallucination signals.
  - **P2 PDF On-Demand**: New endpoint `GET /{project_id}/pdf` generates 15-min signed URLs dynamically. Soft-delete pattern implemented (status="deleted" + deleted_at) preserving audit trail.
  - **Infrastructure**: Added env vars `N8N_WEBHOOK_HMAC_SECRET` and `N8N_ALLOWED_WEBHOOK_HOSTS` to `src/core/config.py`.
  - **Files Modified**: `src/api/routes/quote_routes.py` (complete rewrite), `src/tools/n8n_mcp_tools.py` (complete rewrite), `src/tools/quote_tools.py` (qty validation), `src/core/config.py`, `src/core/rate_limit.py` (new), `main.py`.

- **Governance**: Standardized on official `gemini-cli` patterns and implemented the **Multi-Agent Collaboration Protocol (v1.0)** in `directives/MULTI_AGENT_PROTOCOL.md` for parallel Antigravity, Gemini-CLI, and Claude Code orchestration.

---

# PROJECT_CONTEXT_SUMMARY.md

**Current Version:** v3.6.11
**Last Updated:** 2026-03-01T14:30:00Z
**Project Phase:** Phase 43 - Quote System Security Hardening [COMPLETE]

---

## 🚀 ACTIVE PRIORITIES (Phase 43)

1.  **Quote System Security Hardening (Complete):** All 7 vulnerabilities (P0–P3) patched. Authentication, rate limiting, HMAC signing, qty bounds, soft-delete, and PDF on-demand signed URLs implemented.
2.  **Next: Biometric Auth Expansion**: Extend WebAuthn passkey enrollment to additional devices and recovery flows.
3.  **Backlog: Dynamic Robot Mascot**: Context-aware mascot animations based on conversation phase and project type.
4.  **Backlog: Vertex AI Agent Playbooks**: Plan D implementation (Agent Builder native, session persistence, HITL via ADK).

## 📚 DOCUMENTATION HUB (Master Documents)
*For deep-dives into specific architectural domains, consult:*
- `docs/MASTER_AI_LOGIC.md`
- `docs/MASTER_FRONTEND_MOBILE.md`
- `docs/MASTER_SECURITY_QUALITY.md`
- `docs/MASTER_PRODUCT_JOURNEY.md`

_Documento aggiornato: Febbraio 28, 2026_
