# Project Context Summary - Renovation-Next

**Last Updated**: 2026-02-14 (Firebase Testing & Frontend Stabilization Phase)

Questo file serve come memoria storica per l'IA per evitare regressioni su bug critici risolti e mantenere la continuità architetturale.

## 🚀 Novità Sessione Corrente (Phase 8: Mobile UX & M3 Expressive)
Abbiamo elevato l'esperienza mobile a standard Enterprise tramite un sistema di navigazione a gesti ad alte prestazioni.
- **Enterprise Swipe Engine**: Implementato `useSwipeNavigation` hook basato su `MotionValue`. Calcolo della posizione trasformato in manipolazione diretta del DOM (60fps+) evitando re-render di React durante il trascinamento.
- **URL-Driven State**: Sincronizzazione atomica di dashboard panes (`?pane=`) e project tabs (`?view=`) con l'URL. Supporto completo al browser "Back" button e persistenza al refresh.
- **M3 Expressive Core**: Centralizzato il sistema di moto in `lib/m3-motion.ts`. Applicato consistentemente a Dashboard, Navbar, Hero e Services utilizzando spring fisici (`expressive`, `gentle`, `bouncy`).
- **iOS Resilience**: Implementata edge exclusion zone (20px) per evitare conflitti con la gesture "Back" di Safari/iOS e introdotto escape hatch `data-no-swipe` per elementi grafici interattivi (CAD/Mappe).
- **Security Hardening (App Check)**: Implementata integrazione end-to-end con Firebase App Check. I proxy Next.js ora estraggono e propagano il token `X-Firebase-AppCheck` al backend FastAPI per la validazione server-side.
- **Logging Improvements**: Ottimizzato il logger Python per supportare UTF-8 su Windows e forzato il formato JSON in produzione per una migliore tracciabilità via Cloud Logging.
- **Enterprise Documentation**: Riscritto `SECURITY.md` per riflettere l'architettura 3-tier, l'integrazione Passkey e le policy anti-abuse (App Check/reCAPTCHA Enterprise).
- **Public Brand Upgrade**: Aggiornato il `README.md` principale a standard istituzionale, includendo il Technology Matrix e il dettaglio dell'architettura "3-Tier Law".

## 🕒 Novità Precedenti (Phases 6-7: Resilience & Hardening)
- **Frontend Resilience (P7)**: Error Boundaries su 3 livelli (Global, App, Dashboard) + Safety Audit su tutti i `.map()` (zero-trust null guards).
- **Backend Hardening (P6)**: Migrazione completa a `utc_now()`, validazione regex UID, eradicazione bare `except:`.
- **UI Architecture**: Sincronizzazione "Golden Sync" tra Pydantic e TypeScript interfaces.

## 🕒 Riepilogo Fasi Precedenti (Fase 5: Guided Flows & UI Polish)
- **Guided Flows**: State tracking per cross-sell (es. Render dopo Preventivo).
- **Lead Capture Widget**: Tool `display_lead_form` per raccolta sicura dati PII.
- **Material 3 Expressive**: Polish con animazioni fisiche e rounded corners `12px`.

---

## 🏢 Chain of Thought (CoT) & Logic Integration

### 1. Protocollo di Ragionamento (Backend)
- **LangGraph Implementation**: Il `reasoning_node` utilizza **Gemini 2.5 Flash** per generare piani strutturati.
- **PII Redaction**: Meccanismo di sicurezza che oscura dati sensibili negli argomenti dei tool.

### 2. Sincronizzazione Frontend & UI
- **Error Prevention**: Layer gerarchico di Error Boundaries per prevenire il blocco totale dell'interfaccia.
- **ThinkingIndicator**: Visualizza Confidence, Intent e passaggi logici (Thinking Box).
- **Sync History**: Firestore sincronizzato con stato locale via `useChatHistory`.

---

## 🛠️ Bug Critici Risolti (Regression Prevention)

- **Mobile Gesture Conflicts**: Risolto il conflitto tra lo swipe della gallery e l'edge-swipe del sidebar (Phase 8).
- **Lag Navigazione Mobile**: Eliminato il lag nei gesti passando da State-driven a MotionValue-driven animations (Phase 8).
- **White Screens**: Eliminati tramite Error Boundaries (Phase 7).
- **Type Error (dashboard)**: Fixato crash in `ProjectSettingsView` (Phase 7).
- **Bare Excepts (S6)**: Risolto in 6 file critici (Phase 6).
- **Naive Datetimes (L3)**: Migrati tutti i `datetime.utcnow()` (Phase 6).
- **Project ID Failure**: Corretta configurazione Admin SDK in Cloud Run.
- **Quota Timezone Bug**: `datetime.fromtimestamp()` ora usa sempre `tz=timezone.utc` in `src/tools/quota.py` per prevenire bypass.

## Current Architecture
- **Tech Stack**: Next.js (App Router) + FastAPI + LangGraph + Firebase.
- **Resilience**: 3-level Error Boundaries + guarded .map() calls.
- **Navigation**: MotionValue-based swipe engine + URL State Sync.
- **Standards**: Zero naive datetimes, explicit exception handling, zero-trust UID validation.

| Tipo di Dato | Percorso Firestore | Percorso Storage |
| :--- | :--- | :--- |
| **Sessione (Backend)** | `sessions/{id}` | `user-uploads/{id}/` |
| **Progetto (Frontend)** | `projects/{id}` | `projects/{id}/uploads/` |

---

## 🧪 Phase 9: Frontend Test Stabilization (Feb-14-2026)
### ✅ Firebase Testing Pattern (COMPLETED)
**Problem**: ChatHeader tests failing because Firebase SDK attempted real initialization in JSDOM environment.

**Solution**: Centralized Firebase mocks in `web_client/jest.setup.js`:
```javascript
jest.mock('firebase/app', () => ({
    initializeApp: jest.fn(() => ({ name: '[DEFAULT]' })),
    getApps: jest.fn(() => []),
    getApp: jest.fn(() => ({ name: '[DEFAULT]' })),
}));
// ... similar mocks for firebase/auth, firebase/firestore, firebase/storage, firebase/app-check
```

**Results**:
- ChatHeader: 4/4 tests passing ✅
- Type-check: 0 errors ✅
- Firebase initialization properly mocked (verified by console log)
- Test files updated to match component implementation (removed obsolete "Online" status)

**Key Lesson**: When testing Firebase-dependent components, ALWAYS mock at the module level in jest.setup.js, not at individual test file level.

### ⏳ Backend Async Firestore (IN PROGRESS)
- Update `test_quota.py` and `test_quota_overrides.py`
- Replace `patch('src.tools.quota.firestore.client')` with `patch('src.tools.quota.get_async_firestore_client')`
- Use `AsyncMock` for async operations

## 📋 Regole Operative (Elephant Memory)
1. **Model Version**: Reasoning: `gemini-2.5-flash`, Vision/Video: `gemini-3-flash-preview`.
2. **Error Boundaries**: Se crei una nuova sezione, assicurati che sia coperta da un `error.tsx`.
3. **Datetime**: Usa SEMPRE `src.utils.datetime_utils.utc_now()`.
4. **Exceptions**: MAI usare `except:`. Usa SEMPRE `except Exception:`.
5. **Mobile Navigation**: Usa `useSwipeNavigation` per gestire gesture orizzontali ad alte prestazioni.
6. **Firebase Testing**: Mock ALL Firebase modules in `jest.setup.js` to prevent real SDK initialization in JSDOM.

---

## 🚀 Documentazione di Riferimento
- `brain/bff59a82-92ed-457b-a4d3-44adfa65b03d/walkthrough.md` (Timeline completa Mobile UX & M3)
- `directives/HISTORICAL_MILESTONES.md` (Indice cronologico Fasi 1-9)
- `C:\Users\User01\.claude\projects\c--Users-User01--gemini-antigravity-scratch-renovation-next\memory\MEMORY.md` (Firebase Testing Pattern & Project Memory)
