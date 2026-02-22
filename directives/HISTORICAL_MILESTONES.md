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

## 👁️ Fase 16: Production Stability & App Check Fix (Feb-17-2026)
*Risoluzione del blocco dashboard e hardening delle policy CSP.*
- **CSP & App Check Resolution**: Identificato e risolto il blocco di reCAPTCHA v3 causato da una CSP troppo restrittiva. Abilitata la comunicazione con `google.com` per la generazione dei token.
- **Project ID Alignment**: Corretta l'inconsistenza del `PROJECT_ID` tra backend e ambiente di produzione per garantire la corretta inizializzazione del Firebase Admin SDK.
- **Security First Approach**: Rifiutata la disattivazione di App Check in favore di una risoluzione tecnica del problema di generazione token, mantenendo lo standard Enterprise-Grade.
- **URL Desynchronization Fix**: Sincronizzate le URL dei rewrite in `next.config.ts` per puntare al servizio Cloud Run attivo (`chatbotluca-a8a73`).

## 🛡️ Fase 17: Backend Recovery & Diagnostic Instrumentation (Feb-17-2026)
*Stabilizzazione del backend e inserimento telemetria per bug App Check.*
- **Backend Test Stability**: Suite unitaria (74/74) e integrazione (6/6) completamente verdi dopo il ripristino dei mock di Firestore.
- **Diagnostic Injection**: Inseriti log di telemetria in `lib/firebase.ts` e `lib/api-client.ts` per identificare la causa della mancata generazione del token App Check.
- **CSP Hardening (reCAPTCHA v3)**: Espansa la Content Security Policy includendo `www.recaptcha.net` e `vercel.live` per sbloccare i flussi di validazione secondari e i feedback tools.
- **URL Realignment**: Correzione finale delle URL di rewrite nel frontend per puntare alla revisione attiva di Cloud Run.
- **Git Hygiene**: Rimossa definitivamente la memoria dell'agente dal tracking remoto per privacy e sicurezza.

## 🛡️ Fase 18: CSP Frame Hardening & Vercel Integration (Feb-17-2026)
*Sblocco definitivo degli iframe e hardening per reCAPTCHA v3 (Release 2.2.41).*
- **Phase 18 (Release 2.2.41)**: Vercel Toolbar CSP fix and navigation updates.
- **Phase 18 (Release 2.2.42)**: Security hardening (`fast-xml-parser`), Dashboard UI scaling optimization, and Firestore session ownership fix.
- **CSP Frame Fix**: Aggiunto `vercel.live` e `www.gstatic.com` a `frame-src`.
- **Vercel Toolbar Support**: Risolto popup di errore CSP aggiungendo `vercel.com` e `assets.vercel.com` alle direttive `img-src` e `font-src`.
- **Versioning**: Passaggio a numerazione granulare (2.2.41).
- **Troubleshooting Documentation**: Creato report per la verifica della Whitelist domini nella console Admin di reCAPTCHA.

---

## 💎 Fase 19: Luxury UI Aesthetic & Focused Image Comparison (Feb-18-2026)
*Implementazione dello standard visivo "Luxury Tech" e perfezionamento del motore di confronto.*
- **Luxury UI Overhaul**: Unificazione di tutti i pulsanti e gli stati attivi (Sidebar, Dashboard, Gallery) con l'estetica **Golden Glassmorphism** e glow interni.
- **Focused Blur Reveal**: Riprogettazione del componente `ComparisonThumbnail.tsx`. Ora la foto originale sfoca dinamicamente per rivelare il render AI, mantenendo quest'ultimo perfettamente nitido e focalizzato.
- **M3 Expressive Motion**: Applicazione sistematica di curve di easing "Emphasized" (`[0.05, 0.7, 0.1, 1.0]`) per un feeling premium e pesante ("weighted").
- **Accessibility & Linting**: Risoluzione di tutti i warning Radix UI e pulizia radicale degli import inutilizzati, garantendo una build pulita al 100%.
- **Versioning**: Rilascio stabile `v2.2.44`.

## 📉 Fase 20: Gemini Cost Optimization (Feb-19-2026)
*Gestione dei costi operativi e ottimizzazione dei modelli AI.*
- **Model Downgrade Strategy**: Migrazione dei task non creativi (CAD vectorization, Verify scripts) da Gemini Pro a `gemini-1.5-flash` e `gemini-3-flash-preview`.
- **Pro Guard**: Refactoring di `src/api/gemini_imagen.py` per supportare override del modello, prevenendo usage accidentale di modelli costosi durante i test.
- **Cost Audit**: Analisi completa dei consumi e implementazione di logiche di routing del modello basate sulla complessità del task.

## 🤖 Fase 21: Quote AI Insight Engine (Feb-19-2026)
*Implementazione del cervello analitico per i preventivi automatici.*
- **Insight Engine**: Creazione del motore di analisi `src/services/insight_engine.py` basato su Gemini Flash per estrarre SKU e quantità da chat e foto.
- **Master Price Book**: Definizione della "Single Source of Truth" per i prezzi (`src/data/master_price_book.json`), eliminando le allucinazioni finanziarie.
- **Pricing Service**: Implementazione del calcolo deterministico (Python) per totali e IVA.
- **Quote Tool**: Rilascio del tool `suggest_quote_items` per l'agente, integrato con il sistema di memoria e prezzo.

## 🏗️ Fase 22: Admin Console & Security (Feb-19-2026)
*Creazione della dashboard di back-office sicura per la revisione.*
- **Streamlit Dashboard**: Sviluppo dell'applicazione Admin (`admin_tool/`) con interfaccia di revisione interattiva (`st.data_editor`).
- **Security Hardening**: Implementazione di `streamlit-authenticator` con hashing Bcrypt per l'accesso protetto.
- **Pattern Alignment**: Refactoring del backend secondo il pattern `QUANTITY_SURVEYOR.md` (Chat Summary, SKU Validation).
- **Versioning**: Rilascio `v2.4.1`.

## 📤 Fase 23: Delivery Integration (Feb-19-2026)
*Chiusura del cerchio con generazione documenti e invio.*
- **PDF Engine**: Implementazione di `PdfService` con `xhtml2pdf` e Jinja2 per la generazione di preventivi professionali.
- **Delivery Pipeline**: Creazione di `DeliveryService` per l'upload su Firebase Storage e l'innesco di webhook n8n/MCP.
- **End-to-End Flow**: L'azione "Approve" ora scatena la sequenza completa: Generazione → Upload → Invio → Aggiornamento DB.
- **Status**: Sistema Preventivi Completo (`v2.5.0`).

## 🏗️ Fase 24: Admin Console Enterprise Hardening (Feb-19-2026)
*Rifactoring skill-driven completo dell'admin console.*
- **`delivery_service.py`**: `requests` → `httpx.AsyncClient` + `tenacity` (3x exponential backoff). Skill: `n8n-mcp-integration`.
- **`pdf_service.py`**: UTC-aware datetimes, docstring CPU-bound per `run_in_threadpool`. Skill: `generating-pdf-documents`.
- **`quote_repo.py`**: Nuovo `get_client_info()` legge `client_email`/`client_name` reali da Firestore.
- **`admin_service.py`**: Pipeline approvazione con dati cliente reali, `ThreadPoolExecutor` per PDF.
- **`dashboard.py`**: 3 KPI aggregati (count, totale, media), encoding € corretto.
- **`review.py`**: Expander contesto progetto, `admin_notes` pre-popolate, bottone Reject.
- **`firebase_init.py`**: `print()` → `logger`, guard idempotente, ADC fallback documentato.
- **Versioning**: `v2.6.0`.

## 🔀 Fase 25: Multipage Architecture + HITL Graph (Feb-20-2026)
*Migrazione a Streamlit native multipage e implementazione del flusso HITL preventivi.*
- **Admin Multipage**: `app.py` → pure auth shell. Nuove pagine: `1_📋_Quotes.py` (lista+review+approve) e `2_💰_Price_Book.py` (editor SKU interattivo, KPI, CSV export, auth guard).
- **HITL Quote Graph**: `quote_state.py` (TypedDict separato), `quote_graph.py` (FirestoreSaver, `interrupt_before=["admin_review"]`, `QuoteGraphFactory`), `quote_routes.py` (POST `/start` + `/approve` con pattern `ainvoke(None, config)` skill-compliant).
- **Error Handling Patterns**: Gerarchia eccezioni domain-specific (`QuoteNotFoundError`, `CheckpointError`, `PDFGenerationError`, `DeliveryError`) in backend e admin_tool. `quote_repo.get_quote()` ora solleva invece di restituire `{}`.
- **Decisione Piano C**: Deferred a `v3.0.0` — `AgentOrchestrator` stabile, `FirestoreSaver` applicato solo al QuoteGraph come compromesso.
- **Skill**: `langgraph-hitl-patterns`, `error-handling-patterns`, `building-admin-dashboards`.
- **Versioning**: `v2.8.0`.
- **Pending**: Registrare `quote_routes.py` in `main.py` + UAT end-to-end.

## 🏛️ Fase 26: Schema Enrichment & Infrastructure Hardening (Feb-20-2026)
*Solidificazione dello schema dati e allineamento dipendenze per UAT.*
- **Firestore Schema Upgrade**: Integrazione dei campi `client_email`, `client_name` e `address` nel repository e nella pipeline di consegna n8n.
- **`uv` Synchronization**: Sincronizzazione completa del backend con risoluzione pacchetti `langgraph-checkpoint-firestore`.
- **Admin Tool Setup**: Installazione dipendenze e configurazione lancio via `python -m streamlit` per l'ambiente locale.
- **Utility Tooling**: Creazione di `enrich_projects.py` per il patching massivo dei dati legacy, garantendo la compatibilità con la nuova dashboard.
- **Skill Alignment**: Audit finale del grafo HITL confermato al 100% conforme ai pattern `langgraph-hitl-patterns`.
- **Versioning**: `v2.9.0`.

## 🏗️ Phase 27: Main modernization & UAT Readiness (Feb-20-2026) ✅
*Modernizzazione del backend e risoluzione blocchi critici per il grafo HITL.*
- **FastAPI Modernization**: Migrazione a `lifespan`, validator Pydantic V2 e logging strutturato in `main.py`.
- **HITL Graph Stability**: Risolto il `TypeError` nel `FirestoreSaver` e allineate le dipendenze in `pyproject.toml`.
- **Infrastructure**: Creati template `.env` per backend e admin_tool. Integrata notifica n8n automatica post-draft.
- **Versioning**: Incremento a `v2.9.21`.
## 🤖 Phase 28: TestSprite Alignment & n8n MCP Integration (Feb-20-2026)
*Standardizzazione dei test automatizzati e orchestrazione esterna.*
- **TestSprite Alignment**: Allineati tutti i 10 script Python (`TC001-TC010`) con i percorsi `/api/` e implementato `test_router.py` come gateway REST per i tool LangGraph.
- **n8n MCP Integration**: Configurato il server MCP per l'integrazione con l'istanza n8n (apaxhud.app.n8n.cloud), abilitando notifiche admin e delivery workflow.
- **QA Skill Creation**: Creata la skill `testsprite-automated-qa` per formalizzare i pattern di test e prevenire regressioni architettoniche.
- **Status**: Backend QA-Ready (v2.9.30).

## � Phase 29: Mobile Capture & Security Audit (Feb-21-2026)
*Implementazione della cattura multimediale nativa e rafforzamento della sicurezza.*
- **Mobile Capture**: Integrazione della skill `mobile-camera-capture`. Supporto nativo per foto/video in Chat e Dashboard.
- **Security Audit**: Hardening del workflow n8n (fix HMAC fail-open) e analisi privacy per la cattura mobile.
- **Enterprise UX**: Prime applicazioni della skill `enterprise-user-dashboard-ux` (Bento/Glassmorphism).

## �📰 Fase 30: Blog Modernization & SEO/GEO Optimization (Feb-21-2026)
*Refactoring completo del blog con approccio "Image-First" e ottimizzazione per i motori di ricerca generativi (GEO).*
- **Blog Index Overhaul**: Implementazione di un layout a schede (grid) con immagini di alta qualità pertinenti al mondo delle ristrutturazioni d'interni e bioedilizia.
- **SEO & GEO Compliance**: Iniezione di dati strutturati JSON-LD (`Blog`, `BlogPosting`) per favorire l'indicizzazione da parte di LLM e motori tradizionali.
- **Performance Optimization**: Utilizzo di `next/image` con `priority` per la prima card per ottimizzare l'LCP (Largest Contentful Paint).
- **Resilient Image Fetching**: Risoluzione definitiva degli errori 404 sulle immagini tramite validazione automatizzata dei link esterni.
- **Versioning**: Rilascio stabile `v2.9.50`.

## 📱 Phase 31: M3 Expressive Dashboard & Swipe Stabilization (Feb-21-2026)
*Raffinamento estetico e stabilizzazione delle gesture.*
- **Swipe Stabilization**: Refactoring di `MobileSwipeLayout.tsx` per eliminare deformazioni del layout. Sostituzione della traslazione fisica con indicatori M3 non distruttivi.
- **M3 UI Redesign**: Nuove interfacce per Capture Dialog e Project Selector con glassmorphism avanzato e glow "luxury-gold".

## 📱 Phase 32: SEO & GEO Optimization (Feb-22-2026)
*Standardizzazione della visibilità IA e motori di ricerca.*
- **GEO Compliance**: Creazione di `public/llms.txt` per Perplexity e Gemini.
- **SEO Infrastructure**: Implementazione dinamica di `sitemap.ts` e `robots.ts`. Upgrade dei metadati OpenGraph e Twitter.

## 📱 Phase 33: Auth Resilience & Swipe UI Polish (Feb-22-2026)
*Risoluzione blocchi OAuth e pulizia gesture native.*
- **Firebase OAuth Fix**: Configurazione header COOP/COEP `unsafe-none` per sbloccare i popup di login in Chrome.
- **Gesture Hardening**: Disabilitazione del `overscroll-behavior-x` nativo per evitare conflitti con il design M3.

## 📱 Phase 34: QA Verification & Infrastructure Polish (Feb-22-2026)
*Verifica end-to-end e allineamento TestSprite.*
- **TestSprite Alignment**: Verifica dei TC001-TC005 tramite orchestratori Python.
- **Infrastructure Fixes**: Risoluzione bug critici su hero video e race condition nel logout Firebase.

## 🏗️ Phase 35: Build Verification & Technical Stabilization (Feb-22-2026)
*Stabilizzazione del backend e raggiungimento del 100% test pass rate.*
- **Backend Testing Achievement**: Raggiunto il 100% di success rate (173/173 test) su Pytest.
- **n8n Mocking Sync**: Correzione del mismatch async/sync nei mock di `httpx` in `conftest.py`.
- **Schema Golden Sync**: Aggiornamento del modello `QuoteItem` per supportare quantità zero, garantendo la compatibilità con i casi d'uso reali.
- **Documentation Audit**: Audit completo e aggiornamento di tutti i README (Root, Backend, Frontend) e delle direttive storiche.

## 🏗️ Phase 36: GitHub Connection & Technical Sync (Feb-22-2026)
*Configurazione sicura del repository tramite Personal Access Token (PAT) e sincronizzazione branch.*
- **GitHub Authentication**: Configurazione della connessione remota `origin` tramite PAT fornito dall'utente.
- **Credential Persistence**: Abilitazione del `credential.helper store` per garantire la persistenza dell'autenticazione.
- **Main Branch Sync**: Sincronizzazione del branch `main` con il repository remoto (`ionmidori/Website-renovation`).
- **Status**: Repository Sincronizzato ✅.

---
_Documento aggiornato: Febbraio 22, 2026_
