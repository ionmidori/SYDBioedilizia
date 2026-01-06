# Security Policy

## Supported Versions

This project is currently in active development.

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability within this project, please send an e-mail to **security@renovation-ai.it**. All security vulnerability reports will be promptly addressed.

## Security Measures Implemented

### 1. Supply Chain Security
- **Strict Dependency Management**: We regularly audit `package.json` for deprecated or vulnerable packages.
- **Lockfile Integrity**: `package-lock.json` is committed to ensure deterministic builds.

### 2. Code Security (OWASP)
- **XSS Protection**:
  - React's automatic escaping is leveraged.
  - No use of `dangerouslySetInnerHTML` in user-facing components.
  - Input sanitization implemented in forms (e.g., Newsletter).
- **Secrets Management**:
  - No sensitive API keys are exposed in the client-side code.
  - Environment variables are used for any server-side configuration.

### 3. Network & Headers
- **Security Headers**: The following headers are enforced via `next.config.ts`:
  - `Strict-Transport-Security`: HSTS enabled for 2 years (63072000s) including subdomains.
  - `X-Frame-Options`: set to `SAMEORIGIN` to prevent clickjacking.
  - `X-Content-Type-Options`: set to `nosniff`.
  - `Referrer-Policy`: set to `origin-when-cross-origin`.
  - `Permissions-Policy`: Restrictive policy disabling camera, microphone, and geolocation.
  - `Content-Security-Policy`: Enforced with strict rules for scripts, styles, and frames.

### 4. Input Validation
- **Forms**: All forms (Contact, Newsletter) undergo client-side validation (regex for email) and sanitization before processing.
