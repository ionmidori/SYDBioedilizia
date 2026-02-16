# Project Context Summary - Renovation-Next

- **Last Updated**: 2026-02-17
- **Status**: **Release 2.2.0 DEPLOYED** 🚀 | Gallery Fixed | Security Rules Hardened | Mobile UX Polished
- **Next High Priority**: Phase 25: TBD (Refining Quote AI Orchestration)
Questo file serve come memoria storica per l'IA per evitare regressioni su bug critici risolti e mantenere la continuità architetturale.

## 🚀 Novità Sessione Corrente (Phase 19-24: Release 2.2.0 & Stability)
Abbiamo completato il blocco degli upload guest, risolto bug critici alla galleria e migliorato l'affidabilità del sistema di sessioni.

### 🛡️ Guest Upload Blocking (COMPLETED ✅)
- **Problema**: Utenti anonimi potevano caricare file, consumando quota e storage inutilmente.
- **Soluzione**: Aggiornate `storage.rules` e `firestore.rules` per richiedere `isNonAnonymous()`.
- **Frontend**: `FileUploader.tsx` ora mostra un blocco "Login Richiesto" per gli utenti anonimi.

### 🖼️ Gallery API & Serialization Fix (COMPLETED ✅)
- **Problema**: Errore "Impossibile caricare la galleria" dovuto a un `NameError` nel backend e fallimento di serializzazione dei `Timestamp` Firestore.
- **Soluzione**: Refactored `reports.py` per rimuovere codice legacy, implementata serializzazione ISO per le date e aggiunto `projectName` nei metadati per ottimizzazione UI.

### ⚡ Server Action & Logout Resilience (COMPLETED ✅)
- **Action Limit**: Aumentato `bodySizeLimit` a **10mb** in `next.config.ts` per gestire upload pesanti via Server Actions.
- **Logout Fix**: Risolto race condition in `AuthProvider.tsx` resettando lo stato `user` a null *prima* dell'invalidazione del token, evitando errori di "Insufficient Permissions" durante il redirect.

### 📱 Mobile UX: Contact Menu (COMPLETED ✅)
- **Miglioramento**: Aggiunta chiusura automatica del menu contatti cliccando all'esterno (background), migliorando la navigazione su dispositivi touch.

---

## 🚀 Novità Precedenti (Phase 18: Deep Project Claiming & Security Hardening)
Risolto il blocco dei permessi tramite una trasformazione profonda dei metadati durante il login.

### 🔐 Deep Project Claiming (COMPLETED ✅)
- **Problema**: L'uso di fallback "guest_*" nelle regole Firestore era una soluzione temporanea che riduceva la precisione della sicurezza.
- **Soluzione**: Implementato "Deep Claim" nel backend (`projects.py`). Al login, il sistema ora trasferisce atomicamente la proprietà di sessioni, progetti e file (campo `uploadedBy`) al UID reale dell'utente.
- **Hardening**: Ripristinate regole `firestore.rules` rigorose con vincolo `userId == request.auth.uid`, eliminando i pattern matching permissivi per guest.
- **Files**: `backend_python/src/db/projects.py`, `firestore.rules`.

## 🚀 Novità Precedenti (Phase 15: Guest Authentication Fix)
Risolto definitivamente il race condition che impediva agli utenti guest di inviare il primo messaggio.

### 🔐 Guest Chat Authentication Fix (COMPLETED ✅)
- **Problema**: Guest users ricevevano errore "Authentication required" al primo messaggio perché `getRequestOptions()` veniva chiamato PRIMA che `signInAnonymously()` completasse.
- **Root Cause**: Sequenza errata in `ChatProvider.sendMessage()` → il token veniva richiesto prima che Firebase creasse l'utente anonimo.
- **Soluzione Dual-Layer**:
  1. **AuthProvider.refreshToken()** (lines 249-274): Aggiunto fallback `auth.currentUser || user` per gestire race conditions nello stato React.
  2. **ChatProvider.sendMessage()** (lines 179-210): Riordinata logica - `signInAnonymously()` viene chiamato PRIMA di `getRequestOptions()`.
  3. **ChatProvider.getRequestOptions()** (lines 150-170): Rimosso check condizionale `if (user)` - ora sempre tenta di recuperare il token.
- **Verification**: Modalità incognito → messaggio immediato → verifica console (no errori), network tab (`Authorization: Bearer <token>`), streaming OK.
- **Files**: `web_client/components/providers/AuthProvider.tsx`, `web_client/components/chat/ChatProvider.tsx`.

## 🚀 Novità Precedenti (Phase 16: Multi-Agent Convergence)
Abbiamo unificato formalmente la memoria e le direttive tra Claude e Gemini (Antigravity).

### 🧠 Memory Unification
- **Standardization**: `gemini.md` è stato aggiornato per essere un mirror completo di `CLAUDE.md`, includendo tutti i comandi di sviluppo, gli standard Tier-3 e le lezioni tratte dagli audit di sicurezza.
- **Verification**: Verificato che il fix di Claude per il race condition in `AuthProvider.tsx` e `ChatProvider.tsx` sia operativo.
- **Security Alignment**: Integrata la logica di prompt injection sanitization in `AgentOrchestrator` nelle direttive condivise per garantire che entrambi gli agenti applichino la stessa "Zero-Trust" policy.

### 🛡️ Secure Data Fetching (Server-Side Migration)
- **API Migration**: Rimosso l'accesso diretto a Firestore dal client per statistiche e galleria. Implementati nuovi endpoint sicuri in `backend_python/src/api/reports.py`.
- **Permission Fix**: Risolto l'errore "Missing or insufficient permissions" filtrando i dati via UID direttamente nel backend tramite Admin SDK.
- **Index Optimization**: Eliminata la necessità di un indice `collectionGroup` manuale per la Galleria Globale tramite un pattern di aggregazione per-progetto nel backend.

### 🏗️ Dashboard UI Enhancement
- **Empty State**: Creato `EmptyProjectsState.tsx` per gestire utenti con zero progetti, fornendo una guida chiara invece di un errore o una bacheca vuota.
- **Error Handling**: Implementato un sistema di interceptor migliorato e rimossi i crash "500 Internal Error" causati da import mancanti.

## 🚀 Novità Precedenti (Phase 14: Renovation Planning & Claude Security Audit)
Abbiamo completato la pianificazione del sistema di preventivi, potenziato l'arsenale di "Skills" e applicato un'intensa ondata di hardening di sicurezza guidata da Claude.

### 🛡️ Claude Security Hardening (P1, P2, P3)
Claude ha identificato e risolto 27 vulnerabilità, portando il grado di sicurezza ad **A- (92/100)**:
- **Critical (P1)**: Risolto bypass totale di autorizzazione in `firestore.rules`. Ora progetti e file sono isolati per UID. Sanificate `api/*` endpoints (Pydantic validation) e CORS.
- **High/Medium (P2)**: Protezione `user-uploads` in Storage (richiede auth). Hardening degli header CSP (rimosso `unsafe-inline`). Whitelist RP_ID per i Passkey.
- **Medium/Low (P3)**: Sanificazione messaggi d'errore (evita leak di logica interna in JWT e Video Triage). Atomicità della quota via Firestore `Increment()`.

### 🏗️ Renovation Quote Flow & Admin Console
- **Strategia Scelta**: **Strategy C (Ibrida)**. Prevede un `FirestoreCheckpointer` custom e un "Soft Interrupt" pattern.
- **Workflow**: Chat -> AI Vision Draft -> Admin Review (Streamlit) -> n8n Delivery.
- **Documenti**: `docs/RENOVATION_QUOTE_SYSTEM.md`, `docs/ADMIN_CONSOLE_PRICING_ENGINE.md`, `docs/QUOTE_SYSTEM_STRATEGIES.md`.

### 🛠️ Skill Arsenal Expansion
Installate 8 nuove skill enterprise-grade: `fastapi-enterprise-patterns`, `nextjs-app-router-optimization`, `modern-ui-engineering`, `firestore-data-modeling`, `langchain-architecture`, `application-security-standards`, `python-production-coding`, `git-integrated-workflows`.

## 🤖 Multi-Agent Collaboration (Antigravity + Claude)
Per garantire la massima qualità, il progetto utilizza un approccio multi-agente specializzato:
- **Antigravity (Lead Architect)**: Gestisce l'evoluzione delle feature, la logica di business e l'orchestrazione dei grafi LangGraph.
- **Claude (Security / Auditor)**: Gestisce gli audit di sicurezza, il debugging di basso livello e la stabilizzazione dei tier.
- **Sincronizzazione**: La conoscenza prodotta viene consolidata in questo file per evitare regressioni tra sessioni.

## 🕒 Novità Precedenti
- **M3 Luxury Loader**: Implementato lo "Shape-Shifting" geometrico in `ThinkingIndicator.tsx`. Metamorfosi fluida (Square -> Petal -> Circle) con easing M3 emphasized.
- **M3 Expressive Core**: Centralizzato il sistema di moto in `lib/m3-motion.ts` con spring fisici.
- **iOS Resilience**: Edge exclusion zone (20px) e escape hatch `data-no-swipe`.
- **Frontend Resilience**: Error Boundaries su 3 livelli e zero-trust null guards nei `.map()`.
- **Backend Hardening**: Migrazione completa a `utc_now()`, validazione regex UID, eradicazione bare `except:`.

## 🛠️ Bug Critici Risolti (Regression Prevention)
### 🔐 Guest Authentication Race Condition (FIXED - Feb 16)
**Problem**: Guest users (incognito mode) received "Authentication required" error when sending their first chat message.

**Root Cause**: In `ChatProvider.sendMessage()`, the function called `getRequestOptions()` to fetch the auth token BEFORE calling `signInAnonymously()`. This meant:
1. User sends message → `user = null`
2. `getRequestOptions()` called → `if (user)` check fails → no token
3. `signInAnonymously()` called → creates user async
4. `sdkSendMessage()` sent → request has no `Authorization` header → backend rejects

**Solution (Dual-Layer Fix)**:
1. **AuthProvider.tsx (lines 249-274)**: Enhanced `refreshToken()` with `auth.currentUser || user` fallback. This handles race conditions where Firebase's synchronous `auth.currentUser` is already populated but React state `user` hasn't updated yet.
2. **ChatProvider.tsx (lines 179-210)**: Reordered logic in `sendMessage()` - now `signInAnonymously()` is called FIRST, then `getRequestOptions()` AFTER sign-in completes.
3. **ChatProvider.tsx (lines 150-170)**: Removed conditional `if (user)` check in `getRequestOptions()` - now ALWAYS calls `refreshToken()` which uses the fallback.

**Verification**:
```bash
# Incognito browser → chat widget → send message immediately
# ✅ Console: "[ChatProvider] Anonymous sign-in completed, proceeding with message send"
# ✅ Network: POST /api/chat with "Authorization: Bearer <token>"
# ✅ Response: 200 OK, streaming response
```

**Files Modified**:
- `web_client/components/providers/AuthProvider.tsx` (refreshToken enhancement)
- `web_client/components/chat/ChatProvider.tsx` (sendMessage reordering, getRequestOptions resilience)

### 🔒 Security Audit Consolidato (Claude Phase - Feb 15-16)
- **Rules Hardening**: `firestore.rules` e `storage.rules` ora validano rigorosamente la proprietà dei dati (`resource.data.userId == request.auth.uid`).
- **Passkey Whitelist**: RP_ID ora validato contro una whitelist in `passkey.py` per prevenire spoofing della domain identity.
- **Security Headers**: Implementata CSP rigida (`default-src 'none'`), `Permissions-Policy` e `Cache-Control: no-store` su tutti gli endpoint autenticati.
- **Prompt Injection Defense**: `AgentOrchestrator` ora sanifica i messaggi utente rimuovendo marker di sistema come `[[...]]`.
- **Atomic Quota**: Passaggio a `google.cloud.firestore.Increment` per prevenire race conditions nel conteggio dei render/quote.
- **Error Sanitization**: Tutti gli errori JWT e Video Triage restituiscono messaggi generici all'utente, loggando i dettagli solo server-side.
- **CSP Relaxation (Auth Fix)**: Aggiunti `google.com` e `googletagmanager.com` a `script-src` in `next.config.ts` per sbloccare Firebase Auth/AppCheck.
- **Passkey Whitelist Expansion**: Aggiunti i domini Vercel Preview (`*-git-main-ionmidori.vercel.app`) a `passkey.py` per abilitare la login biometrica nelle review apps.
- **Passkey Proxy Fix**: Il proxy Next.js (`route.ts`) ora inoltra correttamente `Origin` e `X-Forwarded-Host` al backend Python per permettere la validazione corretta del `RP_ID`.

## Current Architecture
- **Tech Stack**: Next.js (App Router) + FastAPI + LangGraph + Firebase.
- **Skills Directory**: Localized in `c:\Users\User01\.gemini\antigravity\skills\`.
- **Resilience**: 3-level Error Boundaries + guarded .map() calls.
- **Standards**: Zero naive datetimes, explicit exception handling, zero-trust UID validation.

| Tipo di Dato | Percorso Firestore | Percorso Storage |
| :--- | :--- | :--- |
| **Sessione (Backend)** | `sessions/{id}` | `user-uploads/{id}/` |
| **Progetto (Frontend)** | `projects/{id}` | `projects/{id}/uploads/` |

---

## 🧪 Phase 9: Frontend Test Stabilization (Feb-14-2026)
### ✅ Firebase Testing Pattern (COMPLETED)
**Solution**: Centralized Firebase mocks in `web_client/jest.setup.js` to prevent JSDOM crashes.

## 📋 Regole Operative (Elephant Memory)
1. **Mandatory Skill Consultancy**: Prima di iniziare qualsiasi task tecnico, architettonico o di debugging, DEVI consultare la directory `skills/` per verificare la presenza di pattern, standard di sicurezza o workflow enterprise già definiti.
2. **Elephant Memory**: Devi consultare `directives/PROJECT_CONTEXT_SUMMARY.md` all'inizio di ogni nuova conversazione.
3. **Skill Discovery**: Antigravity caricherà automaticamente le skill se pertinenti, ma la consultazione proattiva è obbligatoria per garantire lo standard "Zero-Refactor".
4. **Datetime**: Usa SEMPRE `src.utils.datetime_utils.utc_now()`.
5. **Exceptions**: MAI usare `except:`. Usa SEMPRE `except Exception:`.
6. **Mobile Navigation**: Usa `useSwipeNavigation` per gestire gesture orizzontali ad alte prestazioni.

---

## 🚀 Documentazione di Riferimento
- `gemini.md` (Guida per l'IA Gemini e standard architetturali)
- `directives/HISTORICAL_MILESTONES.md` (Indice cronologico Fasi 1-10)
- `c:\Users\User01\.gemini\antigravity\skills\` (Directory delle conoscenze IA)


