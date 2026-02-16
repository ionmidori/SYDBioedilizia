# Cronologia Evolutiva (Historical Milestones) — SYD Bioedilizia

Questo documento traccia l'evoluzione della piattaforma SYD dall'architettura iniziale alla maturità enterprise attuale.

---

## 🏗️ Fase 1: Architettura Core & Sincronizzazione (Gennaio 2026)
*L'obiettivo era stabilire le fondamenta del sistema ibrido Cloud.*
- **Tier 1, 2, 3**: Definizione dei confini architettonici tra Strategia (Directives), Orchestrazione (Web Client) ed Esecuzione (FastAPI).
- **LangGraph Setup**: Implementazione del grafo di ragionamento iniziale con nodi di reasoning e tool call.
- **Firestore Schema**: Definizione della struttura delle collezioni `projects`, `sessions` e `messages`.
- **Base Models**: Creazione degli schemi Pydantic e TypeScript per il "Golden Sync".

## 🤖 Fase 2: Affidabilità Agentica (Inizio Febbraio 2026)
*Rendere l'agente affidabile e le risposte consistenti.*
- **Tool Rigor**: Implementazione obbligatoria degli `args_schema` per ogni tool per prevenire allucinazioni.
- **Memory Persistence**: Integrazione profonda con Firestore per mantenere il contesto delle conversazioni tra i vari task.
- **Auth Hardening**: Prima implementazione della verifica RSA per i token Firebase Auth nel backend.
- **Pydantic Validation**: Risoluzione dei bug 500 legati alla validazione dei tipi complessi in streaming.

## 🎨 Fase 3: User Experience & UI Core (Febbraio 2026)
*Creazione dell'interfaccia utente moderna e reattiva.*
- **Material 3 Foundation**: Introduzione del design system basato su Tailwind CSS 4.
- **Chat Streaming**: Implementazione del protocollo Server-Sent Events (SSE) per un feedback AI in tempo reale.
- **Componenti Core**: Sviluppo di `MessageItem`, `ChatHeader` e del sistema di sidebar per i progetti.

## 🛡️ Fase 4: Security Audit & Production Readiness (Metà Febbraio 2026)
*Preparazione per il deployment su larga scala.*
- **Audit Completo**: Revisione di sicurezza su oltre 50 file sorgente.
- **Cloud Run Config**: Ottimizzazione dei container e gestione delle variabili d'ambiente critiche (Project ID, Storage Bucket).
- **App Check Phase 1**: Integrazione dei token Firebase App Check per proteggere gli endpoint API.
- **Error Handling logic**: Implementazione del Global Exception Handler per evitare leak di stack trace verso l'utente.

## 🚀 Fase 5: Guided Flows & Polish "Soft Expressive" (Feb-11-2026)
*Trasformazione di SYD in un consulente proattivo.*
- **Cross-Selling Intelligente**: Implementazione di flag di stato (`is_quote_completed`) per innescare proposte di servizio contestuali.
- **Lead Capture Widget**: Creazione del componente visuale `LeadCaptureForm.tsx` per la raccolta sicura dei dati PII.
- **Material 3 Polish**: Implementazione di animazioni fisiche framer-motion (spring, scale, stagger) per un feeling premium.
- **Vision AI 0.5x**: Ottimizzazione dei prompt per istruire l'utente sull'uso delle lenti grandangolari.

## 💎 Fase 6: Infrastructure Hardening (Feb-13-2026)
*Finalizzazione standard Enterprise e pulizia radicale.*
- **36 Refactoring Fixes**: Sweep totale su bare `except:`, in-function imports e naive datetimes.
- **L3 Datetime Migration**: Centralizzazione del tempo via `datetime_utils.py` con consapevolezza della timezone.
- **S5 Non-Blocking Storage**: Rendere asincrone le operazioni di pulizia massiva su Cloud Storage.
- **Strategic Artifacts**: Creazione di `IDX_BLUEPRINT_PROPOSAL.md` e `SYD_PROJECT_OVERVIEW_NON_TECH.md`.

## 🛡️ Fase 7: Frontend Resilience (Feb-13-2026)
*Eliminazione del rischio "schermata bianca" e hardening UI.*
- **Next.js Error Boundaries**: Implementazione di un sistema a 3 livelli (`global-error.tsx`, `error.tsx`, `dashboard/error.tsx`) per il recupero automatico dai crash.
- **Safety Audit**: Validazione di tutti i cicli `.map()` con null-guards per prevenire errori di rendering.
- **Type Solidification**: Correzione di inconsistenze nei tipi TypeScript tra frontend e backend (Construction Details).
- **Verified Build**: Validazione finale del bundle di produzione (successo in 26.3s).

## 🛡️ Fase 8: Enterprise Documentation & Brand Upgrade (Feb-14-2026)
*L'elevaizone del progetto a standard istituzionale.*
- **Security Policy**: Riscrittura di `SECURITY.md` con dettaglio su 3-Tier Law, IAM, Ephemeral Data e Secrets Management.
- **Public Brand**: Aggiornamento radicale del `README.md` con Technology Matrix, capacità CAD/Perplexity e architettura.
- **Tech Stack Verification**: Audit completo e allineamento versioni (Python 3.12+, FastAPI 0.128, Tailwind 4).
- **Codebase Clean-up**: Rimozione riferimenti obsoleti e correzione workspace root (`ai_core` -> `backend_python`).

---
## 🚀 Fase 9: Frontend Test Stabilization & Firebase Mocking (Feb-14-2026)
*Risoluzione dei fallimenti nei test frontend legati alla mancanza di mock Firebase.*
- **Firebase SDK Mocking**: Implementazione centralizzata di mock per tutti i moduli Firebase in `web_client/jest.setup.js`.
- **Root Cause Analysis**: Firebase SDK tentava di inizializzare in JSDOM → errori su env vars mancanti.
- **ChatHeader Test Refactoring**: Sincronizzazione test con implementazione attuale (rimosso testo "Online").
- **Verification**: 4/4 ChatHeader tests passing ✅; Type-check 0 errors ✅.
- **Pattern Documentation**: Documentazione in `MEMORY.md` per il Firebase Testing Pattern.

## 📱 Fase 10: Mobile UX & Gesture Engine (Feb-14-2026)
*Ottimizzazione della navigazione touch per performance native.*
- **Enterprise Swipe Engine**: Implementato `useSwipeNavigation` basato su `MotionValue`. DOM manipulation a 60fps+ per il layout a 3 pannelli.
- **Gesture Conflict Resolution**: Risolto il conflitto tra scorrimento carosello progetti e cambio pagina tramite `stopPropagation`.
- **UI Streamlining**: Rimozione sistematica dei bordi UI per un look minimalista e moderno ("Design Flottante").

## 🔒 Fase 11: Multi-Agent Security Audit (Feb-15-2026)
*Hardening totale della piattaforma tramite collaborazione multi-agente (Claude + Antigravity).*
- **Firestore Integrity**: Risolti 3 bug critici nelle regole Firestore (FS-01 to FS-03). Isolamento totale dei dati per proprietario.
- **Production App Check**: Abilitazione della validazione dei token App Check in produzione su Cloud Run.
- **Prompt Injection Defense**: Implementata sanificazione degli input per prevenire manipolazioni del sistema tramite messaggi utente.
- **CORS Hardening**: Restrizione dei metodi HTTP e degli header consentiti per ridurre la superficie di attacco.

## 🧠 Fase 12: AI Intelligence & Memory Fixes (Feb-15-2026)
*Stabilizzazione della logica di conversazione e della memoria a lungo termine.*
- **Memory Continuity**: Corretto bug in `ConversationRepository` che caricava i messaggi più vecchi invece dei più recenti (Risoluzione Amnesia).
- **Flexible Workflow**: Migrazione dalla logica "Sequenziale Rigida" alla logica "Checklist" nell'agente Designer.
- **Async Execution Fix**: Abilitazione dell'invocazione asincrona nei nodi del grafo per prevenire crash durante i render complessi.
- **Multi-Agent Memory**: Consolidamento della conoscenza cross-agente in `PROJECT_CONTEXT_SUMMARY.md`.

## 🚀 Fase 13: Backend Robustness & Image Gen Flow (Feb-15-2026)
*Stabilizzazione definitiva del caricamento messaggi e del motore di rendering.*
- **Chat History Reliability**: Risolto definitivamente il problema dei messaggi "invisibili" recuperando gli ultimi 50 messaggi tramite query `DESCENDING`.
- **JSON Leak Prevention**: Implementato il tagging `reasoning_tier` per l'Architect, garantendo il filtraggio automatico dei dati di ragionamento interni.
- **Configuration & Storage Hardening**: Refactoring completo di `gemini_imagen.py` e `upload.py`. Eliminato l'uso di `os.getenv` a livello di modulo per prevenire race condition sulle credenziali.
- **Architect Parsing Fix**: Risolto crash `AttributeError` nella gestione di output multimodali (liste di part) da parte di Gemini 3.
- **End-to-End Verification**: Creazione della suite `verify_render_flow.py` per garantire la stabilità futura dell'intero ciclo di rendering e upload.

## 🛡️ Fase 14: Renovation Planning & Claude Security Audit (Feb-16-2026)
*Pianificazione del sistema preventivi e hardening totale della sicurezza.*
- **Renovation Spec**: Creazione di `RENOVATION_QUOTE_SYSTEM.md` (computo metrico IA) e `ADMIN_CONSOLE_PRICING_ENGINE.md`.
- **Claude Security Audit (P1, P2, P3)**: Applicazione di 27 correzioni critiche su Firestore rules, CSRF/CORS, Passkey whitelist e sanitizzazione errori.
- **Strategy C (Hybrid)**: Selezione della strategia ibrida per il Pricing Engine, bilanciando costi (Firestore Checkpointer) e resilienza (LangGraph).
- **Enterprise Skill Arsenal**: Installazione di 8 nuove skill (FastAPI patterns, Security, Git workflows) per standardizzazione produttiva.
- **Consolidation**: Sincronizzazione finale della memoria di progetto guidata dai report di Claude.

## 🔐 Fase 15: Guest Chat Authentication Race Condition Fix (Feb-16-2026)
*Risoluzione definitiva del bug di autenticazione per utenti guest al primo messaggio.*
- **Root Cause Identified**: `ChatProvider.sendMessage()` chiamava `getRequestOptions()` PRIMA di `signInAnonymously()`, causando richieste senza token `Authorization` per guest users.
- **AuthProvider Enhancement**: Migliorato `refreshToken()` con fallback a `auth.currentUser` (lines 249-274) per gestire race conditions dove `signInAnonymously()` completa ma lo stato React `user` non è ancora aggiornato.
- **ChatProvider Reordering**: Invertita la logica in `sendMessage()` (lines 179-210): ora `signInAnonymously()` viene chiamato PRIMA di `getRequestOptions()`, garantendo che il token sia disponibile.
- **getRequestOptions Resilience**: Rimosso il check condizionale `if (user)` - ora `refreshToken()` viene sempre chiamato, sfruttando il fallback `auth.currentUser`.
- **Verification Pattern**: Modalità incognito → inviare messaggio immediato → verificare console (no "Authentication required"), network tab (presenza `Authorization: Bearer <token>`), risposta streaming OK.
- **Files Modified**: `web_client/components/providers/AuthProvider.tsx`, `web_client/components/chat/ChatProvider.tsx`.

*Ultimo aggiornamento memoria: 16 Febbraio 2026*

