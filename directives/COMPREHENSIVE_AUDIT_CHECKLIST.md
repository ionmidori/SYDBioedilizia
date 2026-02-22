# Comprehensive Security & Architecture Audit Checklist (2025)

**Status:** Draft | **Date:** 2026-02-22 | **Context:** Next.js 16 + FastAPI + Firebase + LangGraph

This document outlines the mandatory audit steps required to certify the `renovation-next` platform for production. It is based on industry best practices for the specific technology stack used.

## 🚨 Tier 1: Critical Security Gaps (Immediate Action)

These items represent potential vulnerabilities that must be addressed before any further feature development.

- [ ] **Implement Rate Limiting (FastAPI)**
    - **Finding:** `main.py` has CORS and App Check, but no explicit rate limiting middleware (e.g., `slowapi`).
    - **Risk:** DoS attacks, LLM quota exhaustion.
    - **Action:** Install `slowapi` and apply decorators to critical endpoints (`/chat/stream`, `/api/submit-lead`).
    - **Target:** 50 req/min for Chat, 5 req/min for Leads.

- [ ] **Verify LangGraph Serialization Safety**
    - **Finding:** `langgraph-checkpoint-firestore` is used.
    - **Risk:** "Deserialization Gadget" attacks if `JsonPlusSerializer` is used with untrusted input in the state.
    - **Action:** Audit `backend_python/src/graph/` to ensure custom serializers are strict and do not execute arbitrary code during state recovery. Verify `langgraph` version matches security advisory recommendations (>0.1.18).

- [ ] **Enforce "Golden Sync" (Data Contract)**
    - **Finding:** Manual synchronization between Pydantic models (`src/core/schemas.py`) and TypeScript interfaces (`web_client/types/`) is error-prone.
    - **Action:**
        1. Audit `LeadSubmissionRequest` vs Frontend Form.
        2. Audit `ChatMessage` and `ChatRequest` structures.
        3. **Plan:** Setup a CI check (or pre-commit hook) that generates TS types from Pydantic models automatically (using `datamodel-code-generator` or similar) to prevent drift.

- [ ] **Firestore Rules: Schema Validation**
    - **Finding:** Current rules check ownership (`request.auth.uid`) but not data shape/content (e.g., `request.resource.data.name is string`).
    - **Risk:** Malicious users injecting massive payloads or incorrect types, breaking Frontend/Backend parsers.
    - **Action:** Update `firestore.rules` to include `is` checks (e.g., `allow create: if request.resource.data.size() < 10 && ...`).

## 🛡️ Tier 2: Security Hardening (Defense in Depth)

- [ ] **Next.js Server Actions Security**
    - **Context:** Next.js 16 App Router.
    - **Action:** Verify all Server Actions in `web_client/app/` (if any):
        1. Verify Authentication (don't rely on middleware only).
        2. Verify Input Validation (Zod) happens *inside* the action.
        3. Ensure no sensitive data is leaked in the closure.

- [ ] **Dependency Management Strategy**
    - **Finding:** `npm audit` shows 35 vulnerabilities (dev-only).
    - **Action:**
        1. Schedule `npm audit fix` for non-breaking changes.
        2. Configure `dependabot` or `renovate` for weekly updates.
        3. **Mandatory:** Add `pip-audit` to the CI pipeline for the Python backend.

- [ ] **Secret Rotation Policy**
    - **Action:** Document a rotation schedule for:
        1. Firebase Admin SDK Keys (`service-account.json`).
        2. `JWT_SECRET` (if used for internal signing).
        3. `PERPLEXITY_API_KEY` and Google Cloud Vertex AI credentials.

- [ ] **CSP Refinement**
    - **Finding:** CSP is set in `security_headers.py` (`default-src 'none'`).
    - **Action:** Verify this strictly blocks `unsafe-inline` scripts and styles. Test with "Report Only" mode in production for 24h to ensure no valid UI components (e.g., Vercel Analytics, Framer Motion inline styles) are broken.

## 🏗️ Tier 3: Architectural Integrity

- [ ] **Monorepo Boundary Check**
    - **Rule:** "Tier 2 (UI) must NEVER import from Tier 3 (Backend) directly."
    - **Action:** Scan `web_client` imports to ensure no relative paths reach into `../backend_python`. Code sharing must happen via published packages or strictly defined JSON contracts.

- [ ] **Error Handling Standardization**
    - **Finding:** Global exception handler exists.
    - **Action:** Ensure *all* backend errors return the standard JSON structure:
      ```json
      { "error_code": "STR", "message": "STR", "request_id": "UUID" }
      ```
      Verify Frontend `api-client.ts` gracefully handles 4xx/5xx using this specific schema.

- [ ] **Logging & Observability**
    - **Action:**
        1. Verify `X-Request-ID` is propagated from Nginx/Vercel -> FastAPI -> LangGraph -> Firestore.
        2. Ensure PII (names, emails) is Redacted/Masked in logs (`structlog` configuration).

## 🚀 Tier 4: Performance & Scalability

- [ ] **Firestore Indexing Audit**
    - **Action:** Check Firebase Console for "Index suggestions".
    - **Target:** Optimize queries for `sessions` and `projects` collections. Avoid "Collection Group" queries unless strictly necessary.

- [ ] **FastAPI Concurrency**
    - **Action:** Verify `run_in_threadpool` is used for ALL blocking I/O (PDF generation, Image processing) to avoid blocking the main event loop.

## 📝 Audit Execution Log

| Item | Status | Owner | Date Verified |
| :--- | :--- | :--- | :--- |
| Rate Limiting | 🔴 Pending | | |
| Serialization Safety | 🔴 Pending | | |
| Golden Sync Check | 🔴 Pending | | |
| Firestore Schema | 🔴 Pending | | |
| Secret Rotation | 🔴 Pending | | |

---
**Guidance:** Use the `codebase_investigator` to verify each item and mark as ✅ Done or ⚠️ Issue Found.
