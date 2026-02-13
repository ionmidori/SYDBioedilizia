# Security Policy & Architecture

This document outlines the security posture, defensive measures, and reporting protocols for the **Website Renovation** project.

## 🛡️ Enterprise-Grade Security Philosophy

Our architecture follows the **"3-Tier Law"**, ensuring strict separation of concerns to minimize the attack surface:
1.  **Tier 1 (Directives)**: Strategy and SOPs with no executable code.
2.  **Tier 2 (Orchestration - Next.js)**: State presentation and UI logic only.
3.  **Tier 3 (Execution - Python FastAPI)**: Secure environment for business logic, PII processing, and database interactions.

---

## 🔐 Identity & Access Management (IAM)

### 1. Unified Authentication
- **Firebase Authentication**: Leverages OIDC/OAuth 2.0. All ID tokens are verified server-side using the Firebase Admin SDK.
- **Revocation Checks**: Every request undergoes a mandatory revocation check (`check_revoked=True`) to handle banned users or logged-out sessions instantly.
- **Passkey Support**: WebAuthn/FIDO2 integration for biometric-grade security, reducing reliance on traditional passwords.

### 2. Authorization Boundaries
- **Role-Based Access Control (RBAC)**: Enforced via custom claims in JWT tokens.
- **Firestore Security Rules**: Granular, resource-level access control enforced at the database layer.

---

## 🛡️ Bot Protection & Anti-Abuse

### 1. Firebase App Check
The system implements a production-ready **App Check** integration to ensure that only verified clients (our web application) can interact with the backend APIs.
- **reCAPTCHA Enterprise**: Utilizes SCORE-based assessments to invisibly distinguish humans from bots.
- **Header Propagation**: Next.js proxy layers forward `X-Firebase-AppCheck` tokens to the Python backend for strict validation.
- **Audit Trails**: Regular configuration audits ensure environment integrity (see [Configuration Audit](docs/RECAPTCHA_APP_CHECK_AUDIT.md)).

---

## 🌐 Network & Infrastructure Resilience

### 1. Hardened Headers
We enforce industry-standard security headers via `next.config.ts`:
- **HSTS**: `max-age=63072000; includeSubDomains; preload` for enforced HTTPS.
- **X-Frame-Options**: `SAMEORIGIN` to mitigate clickjacking.
- **X-Content-Type-Options**: `nosniff` to prevent MIME-sniffing.
- **Permissions-Policy**: Restrictive policy for hardware access (camera, microphone, geolocation).

### 2. Content Security Policy (CSP)
A strict CSP is enforced to neutralize Cross-Site Scripting (XSS) and code injection:
- `default-src 'self'`
- `script-src` restricted to trusted Google and Firebase endpoints.
- `connect-src` limited to known API and Firebase domains.

---

## 🛠️ Data Protection & Visibility

- **PII Redaction**: Logging systems are configured with `log_args=False` by default to prevent PII leakage into centralized logs.
- **Structured Logging**: JSON-based logs in production for secure, machine-readable observability.
- **Input Sanitization**: Client and server-side validation using **Zod** (Frontend) and **Pydantic** (Backend).

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

| Version | Supported          |
| ------- | ------------------ |
| v1.0.x  | :white_check_mark: |
| < v1.0  | :x:                |

---
**Last Updated**: 2026-02-13
