# 🛠️ SYD Backend: Professional Debugging & Operations Guide

> **Philosophy: Fail Fast, Log Loudly, Recover Gracefully.**
> This document outlines the standard operating procedures (SOPs) for debugging, testing, and deploying the SYD Brain backend.

---

## 🏗️ 1. Architecture Fundamentals (Nested 3-Tier)

The system follows a strict **Nested Architecture** to ensure deterministic AI behavior:

### A. Global Stack
- **Directives** (Piani di Business): Definiscono *cosa* deve accadere.
- **Orchestration** (Frontend): Gestisce l'interfaccia e la sicurezza perimetrale.
- **Execution** (**SYD Brain/Backend**): Esegue la logica complessa.

### B. Internal Backend (The CoT Graph)
Dentro il backend Python, usiamo un modello **Direct-Orchestrate-Execute (DOE)**:
1. **Tier 1: Directive (Reasoning Node)**: Gemini Flash pianifica l'azione finale. Validato da Pydantic.
2. **Tier 2: Orchestration (Bones)**: Edges del grafo (`edges.py`) che smistano il traffico in base al piano.
3. **Tier 3: Execution (Muscle)**: Tools e SOP Manager che applicano le regole finali (RBTA).

**Golden Rule:** Il backend fallisce immediatamente (**Fail-Fast**) se il ragionamento (Tier 1) devia dalle regole Pydantic. Non permettiamo "guesswork" fuori dai binari stabiliti.


---

## 🚨 2. Common Failures & Solutions

### A. Authentication Errors (`401 Unauthorized`)
**Symptom:** API returns 401, frontend shows red toast error.
**Root Cause:**
1.  Frontend `useAuth` hook hasn't finished loading (`loading: true`).
2.  `fetch` was used instead of `fetchWithAuth`.
3.  Token is expired and auto-refresh failed.

**Fix:**
- **Frontend:** Always await `user` and `loading` states. Use `api-client.ts` for ALL requests.
- **Backend:** Check `src/auth/jwt_handler.py`. Ensure `verify_token` dependency is used.
- **Debug:** Check Headers in Network Tab: `Authorization: Bearer eyJ...`.

### B. CORS & Network Errors (`Failed to fetch`)
**Symptom:** Browser blocks request, console shows CORS error.
**Root Cause:**
1.  Backend crashed (port closed).
2.  `origin` header mismatch (localhost:3000 vs 3001).
3.  Vercel/Cloud Run timeouts.

**Fix:**
- **Check Ports:** Backend must be on `:8080`, Frontend on `:3000`.
- **Check Allowlist:** Update `main.py` -> `CORSMiddleware` allow_origins.
- **Zombie Process:** Run `netstat -ano | findstr :8080` and kill the PID.

### C. Streaming & Chat Latency
**Symptom:** Chat bubble appears but remains empty/loading forever.
**Root Cause:**
1.  **Empty Tokens:** Backend yielding empty strings `""` keeps connection open but renders nothing.
2.  **Frontend Aggregation:** `ChatWidget` expects specific Vercel Protocol format (`0:"text"`).
3.  **Optimistic UI:** `sendMessage` needs full object (e.g., missing `attachments`).

**Fix:**
- **Backend:** Ensure `stream_text` in `src/utils/stream_protocol.py` yields valid chunks.
- **Frontend:** Verify `MessageItem.tsx` handles `undefined` content gracefully (show `...`).

### D. Image/File Upload Failures
**Symptom:** "Upload failed" or 400 Bad Request.
**Root Cause:**
1.  **Missing Metadata:** Backend requires `media_type` or `mime_type`.
2.  **Size Limit:** 413 Request Entity Too Large (FastAPI default is generous, but Nginx/Vercel limit is 4.5MB).
3.  **Next.js Optimization:** `storage.googleapis.com` not whitelisted in `next.config.ts`.

**Fix:**
- **Config:** Add domain to `images.remotePatterns` in `next.config.ts`.
- **Payload:** Check `ChatRequest` model in `main.py` matches frontend body.

---

## 🩺 3. Debugging Workflow (The "Hospital" Protocol)

When a bug is reported, follow this **Triage Flow**:

### Step 1: Is the Patient Breathing? (Health Check)
```bash
# Backend Terminal
curl http://localhost:8080/health
# Response: {"status": "ok"}
```
*If this fails, the backend is crashed. Check terminal logs immediately.*

### Step 2: Check Vital Signs (Logs)
1.  **Frontend Logs:** Chrome DevTools > Network > Click Request > **Preview**.
2.  **Backend Logs:** Check `server.log` or terminal output. Look for `ERROR` or `Traceback`.

### Step 3: Isolate the Infection
- **Disable Frontend:** Use `Postman` or `curl` to hit the API directly.
- **Disable Auth:** (Temporarily) Remove `Depends(verify_token)` to rule out auth issues.

---

## ✅ 4. Deployment Checklist (Pre-Flight)

Before pushing to `main` (Production):

- [ ] **Type Safety:** Run `npm run type-check` in `web_client`.
- [ ] **Clean Startup:** Restart backend locally. **NO** `ImportError` or `NameError` allowed.
- [ ] **Build Check:** Run `npm run build` locally to catch Vercel build errors.
- [ ] **Environment:** Verify `.env.local` keys match Production variables.
- [ ] **Ports:** Confirm no zombie processes (`node` or `python`) are lingering.

---

## 🧰 5. Essential Commands Reference

| Action | Command (Windows Powershell) |
| :--- | :--- |
| **Start Backend** | `cd backend_python; uv run uvicorn main:app --reload --port 8080` |
| **Start Frontend** | `cd web_client; npm run dev` |
| **Kill Zombie Ports**| `Get-NetTCPConnection -LocalPort 8080 \| Select-Object OwningProcess` |
| **Run Guard Tests** | `cd backend_python; uv run pytest tests/unit/test_pydantic_guards.py` |
| **Global Sync** | `npm install` (from root) |


---

> **Final Note:**
> Code is read more often than it is written.
> Write clear logs. Handle exceptions explicitly. Don't guess types.
