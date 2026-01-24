# 🛠️ POST-MORTEM & DEBUGGING: Cloud Run Crash Analysis (2026-01-24)

> **Incident:** Cloud Run Deployment Failure (`Container failed to start`)
> **Severity:** Critical (Service Unavailable)
> **Cause:** `NameError: name 'Request' is not defined` in `main.py`
> **Fix:** Added missing import `from fastapi import Request`

---

## 🚨 Root Cause Analysis (RCA)

### 1. The Startup Crash
The recent **App Check Middleware** integration introduced this code block in `main.py`:
```python
@app.middleware("http")
async def app_check_middleware(request: Request, call_next):  # <--- 'Request' type hint used here
```

However, `Request` was **not imported** from `fastapi`.
When Python parsed `main.py` at startup, it hit the undefined `Request` symbol and immediately raised `NameError`, causing the Uvicorn server to crash before binding to port 8080.
Cloud Run detected the health check failure and rolled back the deployment.

### 2. Why Tests Didn't Catch It?
- Only `check_imports.py` was run (which checks *packages*, not internal syntax/logic errors).
- `python -m compileall` checks *syntax* (valid Python grammar), but `NameError` is a *runtime* error (unresolved symbol), not a syntax error.
- Full integration test/local startup was skipped in the rush to push.

---

## 🔍 Debugging Steps (Standard Operating Procedure)

When Cloud Run fails to deploy, follow this checklist **in order**:

### Phase 1: Local Verification (Dev Environment)

**1. Syntax & Import Validity (Static Analysis)**
```powershell
cd backend_python
# Compile checks pure grammar
python -m compileall src main.py
```

**2. Simulation (Runtime Analysis)**
This is the **GOLD STANDARD**. If it runs here, it runs on Cloud Run.
```powershell
# ACTUALLY START the server locally
python -m uvicorn main:app --port 8080
```
*   **Result:** It would have crashed immediately with:
    `NameError: name 'Request' is not defined`
*   **Action:** Read the stack trace → Fix the import.

### Phase 2: Cloud Run Logs Investigation

If local works but Cloud Run fails:

1.  Go to [Google Cloud Console > Cloud Run](https://console.cloud.google.com/run).
2.  Select the service `syd-brain`.
3.  Click **Logs** tab.
4.  Filter Severity to `Error` or `Critical`.
5.  Look for "Payload" messages just before "Container terminated".

**Common Cloud Run Errors & Fixes:**

| Error Message | Meaning | Fix |
|:--------------|:--------|:----|
| `ModuleNotFoundError: No module named 'xyz'` | Missing dependency | Add to `pyproject.toml` |
| `NameError: name 'X' is not defined` | Missing import | Check imports in failing file |
| `Container failed to start. Failed to listen on port 8080.` | Timeout / Crash | Check server logs for Python errors |
| `Memory limit exceeded` | OOM Kill | Increase Memory Limit (e.g., 512MB -> 1GB) |

---

## ✅ Deployment Checklist (Prevention)

Before every `git push`, run this single command to prove the server breathes:

```powershell
# The "Does It Boot?" Test
python -m uvicorn main:app --host 127.0.0.1 --port 8080 --reload
# Wait 5 seconds. If you see "Uvicorn running...", CTRL+C.
```

---

## 🔧 Critical Security Components Check

### 1. App Check Middleware (`src/middleware/app_check.py`)
- **Role:** Validates `X-Firebase-AppCheck` header.
- **Fail Safe:** If `ENABLE_APP_CHECK=false`, it **must** return `None` and let traffic pass.
- **Dependency:** Requires `firebase-admin` initialized.

### 2. Magic Bytes Validation (`src/utils/security.py`)
- **Role:** Checks file hex signatures (MP4, WebM) to prevent rename attacks (`virus.exe` -> `video.mp4`).
- **Dependency:** **PURE PYTHON** (No `libmagic` required). This design choice ensures compatibility with Alpine/Slim Linux containers without ensuring system packages.

### 3. Firebase Auth (`jwt_handler.py`)
- **Role:** Replaces JWT secret with `verify_id_token`.
- **Key Check:** `check_revoked=True` requires a network call to Firebase. If networking fails, auth fails safe (401).

---

## 🔄 Rollback Procedures

If Cloud Run enters a "Crash Loop":

1.  **Immediate:** Revert the main branch.
    ```bash
    git revert HEAD
    git push
    ```
2.  **Manual:** Deploy previous revision in Cloud Run Console.
    *   "Revisions" tab → Select previous green checkmark → "Manage Traffic" → Send 100% to old revision.

---

**Status:**
- `Request` import fixed in `main.py`.
- Server verified locally.
- Ready for re-deployment.
