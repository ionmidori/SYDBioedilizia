# Security Policy & Architecture

This document outlines the security posture, defensive measures, and reporting protocols for the **Website Renovation** project.

## 🛡️ Enterprise-Grade Security Philosophy

Our architecture follows a strict **3-tier boundary** that minimizes the attack surface. Traffic flows in one direction only, and no tier can be skipped:
1.  **Frontend (Next.js, `web_client/`)**: Presentation and UI state only. It never calls Vertex AI, Pinecone or the Firebase Admin SDK.
2.  **Backend (FastAPI, `backend_python/`)**: The only place for business logic, PII processing, authorization and database access.
3.  **AI orchestration (Google ADK, `backend_python/src/adk/`)**: Reached only through the backend. Tools take the user and session from the ADK `tool_context`, never from arguments chosen by the model.

---

## 🔐 Identity & Access Management (IAM)

### 1. Unified Authentication
- **Firebase Authentication**: Leverages OIDC/OAuth 2.0. All ID tokens are verified server-side using the Firebase Admin SDK.
- **Revocation Checks**: Every request undergoes a mandatory revocation check (`check_revoked=True`) to handle banned users or logged-out sessions instantly.
- **Passkey Support**: WebAuthn/FIDO2 integration for biometric-grade security, reducing reliance on traditional passwords.

### 2. Authorization Boundaries
- **Role-Based Access Control (RBAC)**: Enforced via custom claims in JWT tokens, sanitized at the API layer to prevent internal logic leakage.
- **Firestore Security Rules**: resource-level access control (`resource.data.userId == request.auth.uid`) enforced at the database and storage layers. Ownership checks require the parent document to **exist** (no permissive "missing-parent" fallback), and the `users/{uid}` document forbids self-assigned privilege fields (`role`, `admin`, `claims`, …).
- **Passkey Identity Verification**: `RP_ID` validated against an explicit whitelist; dynamic Vercel previews are accepted only when they carry our own team-scope suffix (`-ionmidori.vercel.app`), which prevents spoofing via attacker-owned Vercel projects. WebAuthn signature counters are enforced (a non-increasing counter is rejected) to detect cloned authenticators.
- **Secure Token Proxy**: The Next.js API layer forwards `Origin`, `X-Forwarded-Host`, and `AppCheck` tokens to the Python backend to maintain identity integrity during high-latency vision tasks.

---

## 🛡️ Bot Protection & Anti-Abuse

### 1. Firebase App Check
The system implements a production-ready **App Check** integration to ensure that only verified clients (our web application) can interact with the backend APIs.
- **reCAPTCHA Enterprise**: Utilizes SCORE-based assessments to invisibly distinguish humans from bots.
- **Header Propagation**: Next.js proxy layers forward `X-Firebase-AppCheck` tokens to the Python backend for strict validation.
- **Public routes**: Only the health probes (`/health`, `/health/startup`, `/api/health`, `/ready`), two public read-only content GETs and the internal endpoints are exempt. The internal endpoints authenticate on their own: Cloud Tasks dispatch requires an OIDC token and the Brevo webhook a bearer token.
- **Rate limiting**: `slowapi` limits API routes per client.

---

## 🌐 Network & Infrastructure Resilience

### 1. Hardened Headers
The frontend sets industry-standard security headers in `web_client/next.config.ts`:
- **HSTS**: `max-age=63072000; includeSubDomains; preload` for enforced HTTPS.
- **X-Frame-Options**: `SAMEORIGIN` to mitigate clickjacking.
- **X-Content-Type-Options**: `nosniff` to prevent MIME-sniffing.
- **Permissions-Policy**: Restrictive policy for hardware access (camera and microphone only for the site itself, no geolocation).

The backend adds its own set on **every** response, errors included (`src/middleware/security_headers.py`): HSTS, `X-Frame-Options: DENY`, `nosniff`, a `default-src 'none'` CSP and `Cache-Control: no-store`.

### 2. Middleware order and CORS
The backend middleware is a raw ASGI stack with a fixed order, pinned by `tests/unit/test_middleware_order.py`: request ID, security headers, CORS, error catcher, App Check, idempotency, metrics. The request ID and security headers therefore reach every response, including App Check rejections and unexpected 500 errors, and CORS answers preflights before App Check. CORS allows only the production Vercel origins (plus `localhost` in development); a disallowed origin gets no `Access-Control-Allow-Origin` header.

### 3. Content Security Policy (CSP)
An **enforcing** CSP (not Report-Only) is built per request in
`web_client/lib/security/csp.ts` and emitted by the Next.js proxy
(`web_client/proxy.ts`) to reduce Cross-Site Scripting (XSS) impact. There are
two policies:
- **Strict** (nonce + `'strict-dynamic'`) for dynamically rendered routes such as
  `/dashboard/*`. Next.js stamps the per-request nonce on every script it emits.
- **Allowlist** for statically pre-rendered pages (homepage, blog, legal pages),
  which are built once and can't carry a per-request nonce:
  `script-src 'self'` plus trusted Google/Firebase origins and `'unsafe-inline'`.
  React output escaping remains the primary XSS mitigation there.

Both policies set `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
`frame-ancestors 'none'` and `connect-src`/`img-src`/`frame-src` allowlists.
**Roadmap:** moving the static pages to the strict policy requires rendering
them dynamically.

---

## 🛠️ Data Protection & Visibility

- **Secrets Management**: All 3rd-party API keys (Perplexity, Gemini, Google Cloud) are strictly managed via `pydantic-settings` in `src/core/config.py` and never exposed to the client.
- **Prompt Injection Defense (LLM01/LLM02)**: Two layers. (1) *Always-on* input sanitizer (`src/utils/data_sanitizer.py`): NFKC normalization + delimiter/system-marker stripping (e.g., `[[...]]`) — the primary, always-active defense. (2) *Best-effort* Google Cloud Model Armor guardrail (`before/after_model` callbacks): active only when `MODEL_ARMOR_TEMPLATE_ID` is configured, and **fail-open** by default (an API error passes content through) unless `MODEL_ARMOR_FAIL_CLOSED=true`. Model Armor must not be relied on as the sole control.
- **Atomic Operations**: Critical resource quotas (AI renders, quotes) use Firestore `Increment()` operations to ensure consistency and prevent race-condition-based abuse.
- **Uploaded media**: Photos and videos are stored in Cloud Storage under per-project paths. `storage.rules` allow access only to the owner of the project (`ownsProject`, checked against Firestore), and the rules are tested against the Firebase emulators in CI (`tests/rules/`).
- **PII Redaction**: `JsonFormatter` (`src/core/logger.py`) redacts emails, phone numbers and tokens from every log message and traceback before it is written. Retrieved RAG context is also scrubbed of high-precision PII (email, codice fiscale) before it reaches the model.
- **No Agent-Driven Egress**: No ADK tool can call an external automation endpoint. Outbound email goes through the transactional outbox (fixed providers: Brevo, SMTP); inbound provider events (`/webhooks/email/brevo`) require a bearer token, and Cloud Tasks dispatch requires OIDC.
- **Structured Logging**: JSON-based logs in production for secure, machine-readable observability with unique `X-Request-ID` tracing.
- **Input Sanitization**: Client and server-side validation using **Zod** (Frontend) and **Pydantic** (Backend) with strict regex for ID fields.

---

## 📦 Supply Chain

- **Dependabot** watches the backend (`uv`), the npm workspace, the Docker image and the GitHub Actions. The backend image installs from `uv.lock` with `--locked`, and CI fails if the lock drifts from `pyproject.toml`.
- **Audits on every pull request**: `npm audit` and `pip-audit --strict`, plus **CodeQL** for JavaScript/TypeScript, Python and the workflows.
- **GitHub Actions** use least-privilege `permissions` and are pinned to full commit SHAs.

---

## ⚠️ Reporting a Vulnerability

If you discover a security vulnerability, please do NOT open a public issue. Instead, report it to the security team:

**Email**: [sydbioedilizia@gmail.com]

We commit to:
1.  Acknowledging your report within 24 hours.
2.  Providing a detailed timeline for remediation.
3.  Transparency regarding the impact and fix.

---

## Supported Versions

Only the current production deployment, built from the `main` branch, receives security fixes. There are no maintained older release lines.

---
**Last Updated**: 2026-10-16
