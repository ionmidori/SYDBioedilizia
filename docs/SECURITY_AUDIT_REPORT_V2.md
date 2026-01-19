# 🛡️ SYD Chatbot - Security Audit Report V2

**Date:** January 18, 2026
**Auditor:** Antigravity (AI Security Engineer)
**Scope:** Python Backend (FastAPI), Infrastructure (Cloud Run/Firebase), Auth & Quota Systems.

---

##  EXECUTIVE SUMMARY

The transition to the **Python FastAPI Backend** has significantly improved the security posture compared to the previous Node.js implementation. Key vulnerabilities identified in the previous audit (Jan 16) have been addressed.

**Key Improvements:**
- ✅ **Broken Access Control Fixed:** All chat endpoints now require valid JWT authentication (`verify_token` dependency).
- ✅ **Quota Enforcement:** Tiered quota system (1 anonymous / 3 authenticated) is enforced server-side.
- ✅ **PII Leakage Fixed:** Lead submission logs no longer expose user details.
- ✅ **Secure File Access:** Switched from public ACLs to **Signed URLs**, resolving access issues while maintaining privacy.

**Risk Matrix:**
- **Critical:** 0
- **High:** 1 (Shared Secret Management)
- **Medium:** 1 (Sensitive Data in Logs)
- **Low:** 2 (Dependency Management, Prompt Injection)

---

## 🚨 VULNERABILITY ANALYSIS

### 1. [HIGH] Shared Secret Authentication
**Location:** `src/auth/jwt_handler.py`
**Observation:**
The service uses an `INTERNAL_JWT_SECRET` (`HS256`) to validate tokens from the frontend.
```python
payload = jwt.decode(token, INTERNAL_JWT_SECRET, algorithms=["HS256"])
```
**Risk:**
This is a "Shared Secret" architecture. If this secret is leaked (e.g., via frontend environment exposure or repo commit), an attacker can forge tokens and bypass all identity checks, including quotas.
**Recommendation:**
- **Short Term:** Ensure `INTERNAL_JWT_SECRET` is high-entropy (64+ chars) and rotated regularly.
- **Long Term:** Migrate to **Google Cloud IAM (OIDC)**. Allow the frontend (running on Cloud Run/Vercel) to sign requests with its native Service Account identity, and validate the OIDC token in Python. This removes secret management entirely.

### 2. [MEDIUM] Sensitive Data Logging (Signed URLs)
**Location:** `src/storage/upload.py`
**Observation:**
The application logs the full generated Signed URL:
```python
logger.info(f"Upload complete: {public_url}")
```
**Risk:**
Signed URLs contain the authentication signature (`Goog-Signature`). Anyone with read access to the server logs (e.g., developers, log ingest services) can access the private user images for the duration of the signature (7 days).
**Recommendation:**
Truncate or redact the query parameters in the log:
```python
safe_log_url = public_url.split("?")[0] + "?[REDACTED]"
logger.info(f"Upload complete: {safe_log_url}")
```

### 3. [LOW] Dependency Management
**Observation:**
The project uses `uv` for dependency management. `uv.lock` is present, ensuring reproducible builds.
**Recommendation:**
- Ensure `uv.lock` is always committed.
- Enable automated dependency scanning (e.g., GitHub Dependabot) to catch vulnerabilities in transitive dependencies like `fastapi` or `google-cloud-storage`.

### 4. [LOW] LLM Output Handling (Prompt Injection)
**Location:** `src/vision/triage.py`
**Observation:**
The system parses JSON from LLM output:
```python
text = response.text.replace("```json", "").replace("```", "").strip()
analysis = json.loads(text)
```
**Risk:**
While low in this specific use case (triage), relying on raw string manipulation for JSON extraction can be brittle if the model output varies.
**Recommendation:**
Use **Pydantic Output Parsers** (via LangChain or Baseten) to robustly validate the structure and types of the LLM response, ensuring strictly typed outputs.

---

## ✅ FIXED ITEMS (From V1 Audit)

| ID | Issue | Status | Fix Implementation |
|----|-------|--------|---------------------|
| 1 | **Broken Access Control** | **FIXED** | `src/auth/jwt_handler.py` enforces JWT validation on all `/chat/stream` requests. |
| 2 | **SSRF in Image Fetch** | **MITIGATED** | Backend `upload.py` handles uploads; `generate_render` now uses secure internal paths/signed URLs. |
| 3 | **PII in Logs** | **FIXED** | `src/db/leads.py` logs only Lead ID, not customer PII. |
| 4 | **Public ACLs** | **FIXED** | Switched to Signed URLs (v4) in `src/storage/upload.py` to support Uniform Bucket Access. |

---

## ACTION PLAN

1.  **Immediate:** Redact Signed URL signatures in `upload.py` logs.
2.  **Next Sprint:** Investigate migration to IAM/OIDC for service-to-service auth.
3.  **Continuous:** Monitor `uv.lock` for security updates.

**Approval:**
_Antigravity, Lead Security Engineer_
